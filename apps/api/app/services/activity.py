"""Activity-log helpers (PLAN §3 Phase 1 follow-up).

These append Activity rows inside the caller's existing transaction, so a failed
write rolls back both the domain change and its history record together.
"""

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.user import User

# Fields whose changes are worth surfacing on the history timeline.
TRACKED_FIELDS = (
    "subject",
    "status",
    "priority",
    "type",
    "assignee_id",
    "parent_id",
    "milestone_id",
    "cycle_id",
    "module_id",
    "start_date",
    "due_date",
    "estimated_hours",
)


@dataclass(frozen=True)
class ActorIdentitySnapshot:
    name: str
    profile_image_storage_key: str | None
    profile_image_content_type: str | None


async def capture_actor_identity(
    session: AsyncSession, actor_id: uuid.UUID
) -> ActorIdentitySnapshot:
    cache_key = ("actor_identity_snapshot", actor_id)
    cached = session.info.get(cache_key)
    if isinstance(cached, ActorIdentitySnapshot):
        return cached
    actor = (
        await session.execute(
            select(User)
            .where(User.id == actor_id)
            .with_for_update(read=True)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    snapshot = ActorIdentitySnapshot(
        name=actor.display_name,
        profile_image_storage_key=actor.profile_image_storage_key,
        profile_image_content_type=actor.profile_image_content_type,
    )
    session.info[cache_key] = snapshot
    return snapshot


def activity_actor_fields(snapshot: ActorIdentitySnapshot) -> dict[str, str | None]:
    return {
        "actor_name_snapshot": snapshot.name,
        "actor_profile_image_storage_key": snapshot.profile_image_storage_key,
        "actor_profile_image_content_type": snapshot.profile_image_content_type,
    }


def comment_author_fields(snapshot: ActorIdentitySnapshot) -> dict[str, str | None]:
    return {
        "author_name_snapshot": snapshot.name,
        "author_profile_image_storage_key": snapshot.profile_image_storage_key,
        "author_profile_image_content_type": snapshot.profile_image_content_type,
    }


def _render(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, uuid.UUID | date):
        return str(value)
    return str(value)


async def record_created(session: AsyncSession, wp_id: uuid.UUID, actor_id: uuid.UUID) -> None:
    snapshot = await capture_actor_identity(session, actor_id)
    session.add(
        Activity(
            work_package_id=wp_id,
            actor_id=actor_id,
            action="created",
            **activity_actor_fields(snapshot),
        )
    )


async def record_field_changes(
    session: AsyncSession,
    wp_id: uuid.UUID,
    actor_id: uuid.UUID,
    old_values: dict,
    changes: dict,
) -> None:
    """One Activity row per field that actually changed value."""
    snapshot = await capture_actor_identity(session, actor_id)
    for field in TRACKED_FIELDS:
        if field not in changes:
            continue
        old = old_values.get(field)
        new = changes[field]
        if old == new:
            continue
        session.add(
            Activity(
                work_package_id=wp_id,
                actor_id=actor_id,
                action="field_changed",
                field=field,
                old_value=_render(old),
                new_value=_render(new),
                **activity_actor_fields(snapshot),
            )
        )


async def record_comment(session: AsyncSession, wp_id: uuid.UUID, actor_id: uuid.UUID) -> None:
    snapshot = await capture_actor_identity(session, actor_id)
    session.add(
        Activity(
            work_package_id=wp_id,
            actor_id=actor_id,
            action="commented",
            **activity_actor_fields(snapshot),
        )
    )
