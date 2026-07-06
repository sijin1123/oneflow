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
) -> None:
    """Queue one notification per watcher of the work package — same transaction
    as the triggering change (atomic commit/rollback together).

    Single INSERT..SELECT: membership is joined at fan-out time so revoked
    members receive nothing, the actor never notifies themselves, and `exclude`
    prevents double-notifying users already covered by another kind (e.g. the
    new assignee, who gets the richer 'assigned' notification)."""
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
    await session.execute(
        insert(Notification).from_select(
            ["id", "user_id", "project_id", "work_package_id", "actor_id", "kind", "read"],
            sel,
        )
    )
