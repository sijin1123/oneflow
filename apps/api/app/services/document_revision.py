import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import DocumentRevision, ProjectDocument


def record_document_revision(
    session: AsyncSession,
    *,
    document: ProjectDocument,
    actor_id: uuid.UUID,
    changed_fields: set[str] | tuple[str, ...],
    restored_from_revision_id: uuid.UUID | None = None,
) -> DocumentRevision:
    """Stage one immutable content snapshot in the caller's transaction."""

    revision = DocumentRevision(
        document_id=document.id,
        document_version=document.version,
        actor_id=actor_id,
        title=document.title,
        body=document.body,
        changed_fields=sorted(changed_fields),
        restored_from_revision_id=restored_from_revision_id,
    )
    session.add(revision)
    return revision
