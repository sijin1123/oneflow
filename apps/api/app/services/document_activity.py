import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import DocumentActivity


def record_document_activity(
    session: AsyncSession,
    *,
    document_id: uuid.UUID,
    actor_id: uuid.UUID,
    kind: str,
    changed_fields: set[str] | tuple[str, ...] = (),
) -> None:
    """Stage one display-safe event in the caller's mutation transaction."""

    session.add(
        DocumentActivity(
            document_id=document_id,
            actor_id=actor_id,
            kind=kind,
            changed_fields=sorted(changed_fields),
        )
    )
