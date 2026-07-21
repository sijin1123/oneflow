import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import DocumentRevision, ProjectDocument
from app.services.activity import activity_actor_fields, capture_actor_identity


async def record_document_revision(
    session: AsyncSession,
    *,
    document: ProjectDocument,
    actor_id: uuid.UUID,
    changed_fields: set[str] | tuple[str, ...],
    restored_from_revision_id: uuid.UUID | None = None,
) -> DocumentRevision:
    """Stage one immutable content snapshot in the caller's transaction."""

    actor_snapshot = await capture_actor_identity(session, actor_id)
    revision = DocumentRevision(
        document_id=document.id,
        document_version=document.version,
        actor_id=actor_id,
        title=document.title,
        body=document.body,
        changed_fields=sorted(changed_fields),
        restored_from_revision_id=restored_from_revision_id,
        **activity_actor_fields(actor_snapshot),
    )
    session.add(revision)
    return revision
