"""Data-integrity check helpers (PLAN §13, v5.1).

detect_parent_cycles guards against parent cycles introduced OUTSIDE the app
path (manual SQL, future imports). Anchored as a mandatory pre-import integrity
check for the legacy data-onboarding phase.
"""

import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_CYCLE_SQL = text(
    """
    WITH RECURSIVE walk AS (
        SELECT id AS start_id, parent_id AS cursor_id, 1 AS depth
        FROM work_packages
        WHERE parent_id IS NOT NULL
        UNION ALL
        SELECT walk.start_id, wp.parent_id, walk.depth + 1
        FROM work_packages wp
        JOIN walk ON wp.id = walk.cursor_id
        WHERE wp.parent_id IS NOT NULL AND walk.depth < 1000
    )
    SELECT DISTINCT start_id FROM walk WHERE cursor_id = start_id
    """
)


async def detect_parent_cycles(session: AsyncSession) -> list[uuid.UUID]:
    rows = await session.execute(_CYCLE_SQL)
    return [r[0] for r in rows]
