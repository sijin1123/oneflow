"""Notification helpers (PLAN §3 Phase 2 알림).

Like the activity helpers, these append rows inside the caller's transaction so a
notification is committed atomically with the change that triggered it.
"""

import uuid
from collections.abc import Iterable

from sqlalchemy import and_, false, func, insert, literal, select, true
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import ProjectMember
from app.models.notification import Notification
from app.models.notification_setting import UserNotificationSettings
from app.models.user import User
from app.models.watcher import WpWatcher


async def record_assignment(
    session: AsyncSession,
    *,
    recipient_id: uuid.UUID,
    actor_id: uuid.UUID,
    project_id: uuid.UUID,
    wp_id: uuid.UUID,
) -> None:
    """Notify a work package's new assignee — never yourself, and only if their
    'assigned' preference is on (evaluated at fan-out time; PR-E2)."""
    if recipient_id == actor_id:
        return
    pref = (
        await session.execute(
            select(UserNotificationSettings.assigned).where(
                UserNotificationSettings.user_id == recipient_id
            )
        )
    ).scalar_one_or_none()
    if pref is False:  # absent row = default True
        return
    session.add(
        Notification(
            user_id=recipient_id,
            actor_id=actor_id,
            project_id=project_id,
            work_package_id=wp_id,
            kind="assigned",
        )
    )


async def notify_watchers(
    session: AsyncSession,
    *,
    wp_id: uuid.UUID,
    project_id: uuid.UUID,
    actor_id: uuid.UUID,
    kind: str,
    exclude: Iterable[uuid.UUID] = (),
) -> set[uuid.UUID]:
    """Queue one notification per watcher of the work package — same transaction
    as the triggering change (atomic commit/rollback together).

    Single INSERT..SELECT: membership is joined at fan-out time so revoked
    members receive nothing, the actor never notifies themselves, and `exclude`
    prevents double-notifying users already covered by another kind (e.g. the
    new assignee, who gets the richer 'assigned' notification).

    Returns the ACTUALLY notified user ids (RETURNING) so a later fan-out in
    the same transaction — mentions — can exclude exactly them, not the raw
    candidate set (PLAN v10.1 R1-①)."""
    excluded = {actor_id, *exclude}
    uid = PGUUID(as_uuid=True)
    sel = (
        select(
            func.gen_random_uuid(),
            WpWatcher.user_id,
            literal(project_id, type_=uid),
            literal(wp_id, type_=uid),
            literal(actor_id, type_=uid),
            literal(kind),
            false(),
        )
        .select_from(WpWatcher)
        .join(
            ProjectMember,
            and_(
                ProjectMember.project_id == literal(project_id, type_=uid),
                ProjectMember.user_id == WpWatcher.user_id,
            ),
        )
        # Preference at fan-out time: watch_comment honors `commented`, the other
        # watch kinds honor `watched`; an absent settings row means True (PR-E2).
        .outerjoin(
            UserNotificationSettings,
            UserNotificationSettings.user_id == WpWatcher.user_id,
        )
        .where(
            WpWatcher.work_package_id == wp_id,
            WpWatcher.user_id.notin_(excluded),
            func.coalesce(
                UserNotificationSettings.commented
                if kind == "watch_comment"
                else UserNotificationSettings.watched,
                true(),
            ),
        )
    )
    created = await session.execute(
        insert(Notification)
        .from_select(
            ["id", "user_id", "project_id", "work_package_id", "actor_id", "kind", "read"],
            sel,
        )
        .returning(Notification.user_id)
    )
    return set(created.scalars().all())


async def notify_mentions(
    session: AsyncSession,
    *,
    wp_id: uuid.UUID,
    project_id: uuid.UUID,
    actor_id: uuid.UUID,
    candidate_ids: Iterable[uuid.UUID],
    exclude: Iterable[uuid.UUID] = (),
) -> list[uuid.UUID]:
    """Fan out 'mention' notifications inside the caller's transaction.

    Ordering contract (PLAN v10.1 R1-①): call AFTER notify_watchers and pass its
    RETURNING set as `exclude` — a user already notified via watch_comment never
    gets a duplicate, while a watcher whose 'commented' toggle is off can still
    receive the mention. Non-members and the actor are silently dropped (an
    ex-member mention must not block the comment); the mention preference is
    honored at fan-out time (absent row = True).

    Returns the ACCEPTED mention ids (members, minus actor) — the canonical set
    the comment persists, independent of notification suppression."""
    candidates = [uid for uid in dict.fromkeys(candidate_ids) if uid != actor_id]
    if not candidates:
        return []
    uid_t = PGUUID(as_uuid=True)
    members = set(
        (
            await session.execute(
                select(ProjectMember.user_id).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id.in_(candidates),
                )
            )
        )
        .scalars()
        .all()
    )
    accepted = [uid for uid in candidates if uid in members]
    to_notify = [uid for uid in accepted if uid not in set(exclude)]
    if to_notify:
        sel = (
            select(
                func.gen_random_uuid(),
                ProjectMember.user_id,
                literal(project_id, type_=uid_t),
                literal(wp_id, type_=uid_t),
                literal(actor_id, type_=uid_t),
                literal("mention"),
                false(),
            )
            .select_from(ProjectMember)
            .outerjoin(
                UserNotificationSettings,
                UserNotificationSettings.user_id == ProjectMember.user_id,
            )
            .where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id.in_(to_notify),
                func.coalesce(UserNotificationSettings.mention, true()),
            )
        )
        await session.execute(
            insert(Notification).from_select(
                ["id", "user_id", "project_id", "work_package_id", "actor_id", "kind", "read"],
                sel,
            )
        )
    return accepted


async def record_intake_triage(
    session: AsyncSession,
    *,
    item,
    actor_id: uuid.UUID,
    accepted_wp_id: uuid.UUID | None,
) -> None:
    """Notify the submitter of a FINAL intake verdict (Pass 49, v49.1):
    accepted carries the converted WP; declined/duplicate anchor to the item.
    Triple recipient gate (the Pass-40 rule): submitter exists, is active,
    and is STILL a project member — plus never-yourself and the intake
    preference (creation-time only). Rides the triage transaction."""
    recipient_id = item.submitted_by
    if recipient_id is None or recipient_id == actor_id:
        return
    eligible = (
        await session.execute(
            select(ProjectMember.user_id)
            .join(User, ProjectMember.user_id == User.id)
            .where(
                ProjectMember.project_id == item.project_id,
                ProjectMember.user_id == recipient_id,
                User.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if eligible is None:
        return
    pref = (
        await session.execute(
            select(UserNotificationSettings.intake).where(
                UserNotificationSettings.user_id == recipient_id
            )
        )
    ).scalar_one_or_none()
    if pref is False:  # absent row = default True
        return
    session.add(
        Notification(
            user_id=recipient_id,
            actor_id=actor_id,
            project_id=item.project_id,
            work_package_id=accepted_wp_id,
            intake_item_id=item.id,
            kind="intake_accepted" if accepted_wp_id is not None else "intake_declined",
        )
    )
