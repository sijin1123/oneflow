"""Activity-log helpers (PLAN §3 Phase 1 follow-up).

These append Activity rows inside the caller's existing transaction, so a failed
write rolls back both the domain change and its history record together.
"""

import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity

# Fields whose changes are worth surfacing on the history timeline.
TRACKED_FIELDS = (
    "subject",
    "status",
    "priority",
    "type",
    "assignee_id",
    "parent_id",
    "start_date",
    "due_date",
    "estimated_hours",
)


def _render(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, uuid.UUID | date):
        return str(value)
    return str(value)


def record_created(session: AsyncSession, wp_id: uuid.UUID, actor_id: uuid.UUID) -> None:
    session.add(Activity(work_package_id=wp_id, actor_id=actor_id, action="created"))


def record_field_changes(
    session: AsyncSession,
    wp_id: uuid.UUID,
    actor_id: uuid.UUID,
    old_values: dict,
    changes: dict,
) -> None:
    """One Activity row per field that actually changed value."""
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
            )
        )


def record_comment(session: AsyncSession, wp_id: uuid.UUID, actor_id: uuid.UUID) -> None:
    session.add(Activity(work_package_id=wp_id, actor_id=actor_id, action="commented"))
