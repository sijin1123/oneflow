"""Project storage usage (Pass 57 PR-BW).

ONE aggregate is the single source of truth for both the upload quota check
and the settings Storage tab (v57.1 R1-①): used bytes count only rows with a
stored blob (storage_key set); links have no bytes. The single SELECT also
returns the counts so the read is a self-consistent snapshot (R1-④).
"""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attachment import Attachment
from app.models.document import ProjectDocument
from app.services.document_access import document_visible_clause


async def storage_usage(
    session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID | None = None
) -> tuple[int, int, int]:
    """(used_bytes, file_count, link_count) in one self-consistent SELECT."""
    stmt = select(
        func.coalesce(
            func.sum(Attachment.size_bytes).filter(Attachment.storage_key.is_not(None)), 0
        ),
        func.count().filter(Attachment.storage_key.is_not(None)),
        func.count().filter(Attachment.storage_key.is_(None)),
    ).where(Attachment.project_id == project_id)
    if user_id is not None:
        visible_documents = select(ProjectDocument.id).where(
            ProjectDocument.project_id == project_id,
            document_visible_clause(user_id),
        )
        stmt = stmt.where(
            or_(
                Attachment.document_id.is_(None),
                Attachment.document_id.in_(visible_documents),
            )
        )
    row = (await session.execute(stmt)).one()
    return int(row[0]), int(row[1]), int(row[2])


async def used_bytes(session: AsyncSession, project_id: uuid.UUID) -> int:
    used, _, _ = await storage_usage(session, project_id)
    return used
