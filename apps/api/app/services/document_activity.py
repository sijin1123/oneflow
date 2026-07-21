import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import DocumentActivity
from app.services.activity import activity_actor_fields, capture_actor_identity


async def record_document_activity(
    session: AsyncSession,
    *,
    document_id: uuid.UUID,
    actor_id: uuid.UUID,
    kind: str,
    changed_fields: set[str] | tuple[str, ...] = (),
) -> None:
    """Stage one display-safe event in the caller's mutation transaction."""

    actor_snapshot = await capture_actor_identity(session, actor_id)
    session.add(
        DocumentActivity(
            document_id=document_id,
            actor_id=actor_id,
            kind=kind,
            changed_fields=sorted(changed_fields),
            **activity_actor_fields(actor_snapshot),
        )
    )
