"""Notification helpers (PLAN §3 Phase 2 알림).

Like the activity helpers, these append rows inside the caller's transaction so a
notification is committed atomically with the change that triggered it.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


def record_assignment(
    session: AsyncSession,
    *,
    recipient_id: uuid.UUID,
    actor_id: uuid.UUID,
    project_id: uuid.UUID,
    wp_id: uuid.UUID,
) -> None:
    """Notify a work package's new assignee — never yourself."""
    if recipient_id == actor_id:
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
