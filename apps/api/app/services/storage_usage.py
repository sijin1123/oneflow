"""Project storage usage (Pass 57 PR-BW).

ONE aggregate is the single source of truth for both the upload quota check
and the settings Storage tab (v57.1 R1-①): used bytes count only rows with a
stored blob (storage_key set); links have no bytes. The single SELECT also
returns the counts so the read is a self-consistent snapshot (R1-④).
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attachment import Attachment


async def storage_usage(session: AsyncSession, project_id: uuid.UUID) -> tuple[int, int, int]:
    """(used_bytes, file_count, link_count) in one self-consistent SELECT."""
    row = (
        await session.execute(
            select(
                func.coalesce(
                    func.sum(Attachment.size_bytes).filter(Attachment.storage_key.is_not(None)), 0
                ),
                func.count().filter(Attachment.storage_key.is_not(None)),
                func.count().filter(Attachment.storage_key.is_(None)),
            ).where(Attachment.project_id == project_id)
        )
    ).one()
    return int(row[0]), int(row[1]), int(row[2])


async def used_bytes(session: AsyncSession, project_id: uuid.UUID) -> int:
    used, _, _ = await storage_usage(session, project_id)
    return used
