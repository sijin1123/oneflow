from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.workspace_feature_policy import WorkspaceFeaturePolicy

AI_FEATURE = "ai"
INITIATIVES_FEATURE = "initiatives"
RELEASES_FEATURE = "releases"
WIKI_FEATURE = "wiki"


async def feature_policy(
    session: AsyncSession,
    feature_key: str = WIKI_FEATURE,
    *,
    for_update: bool = False,
) -> WorkspaceFeaturePolicy:
    stmt = select(WorkspaceFeaturePolicy).where(WorkspaceFeaturePolicy.feature_key == feature_key)
    if for_update:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise RuntimeError(f"missing workspace feature policy: {feature_key}")
    return row


async def feature_enabled(session: AsyncSession, feature_key: str = WIKI_FEATURE) -> bool:
    return (await feature_policy(session, feature_key)).enabled


async def ai_effective_enabled(session: AsyncSession, settings: Settings) -> bool:
    return settings.ai_summary_enabled and await feature_enabled(session, AI_FEATURE)


async def require_feature_enabled(session: AsyncSession, feature_key: str = WIKI_FEATURE) -> None:
    if not await feature_enabled(session, feature_key):
        raise HTTPException(
            status_code=403,
            detail={"code": "feature_disabled", "feature": feature_key},
        )
