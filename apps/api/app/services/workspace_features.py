from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workspace_feature_policy import WorkspaceFeaturePolicy

WIKI_FEATURE = "wiki"


async def feature_policy(
    session: AsyncSession, feature_key: str = WIKI_FEATURE
) -> WorkspaceFeaturePolicy:
    row = await session.get(WorkspaceFeaturePolicy, feature_key)
    if row is None:
        raise RuntimeError(f"missing workspace feature policy: {feature_key}")
    return row


async def feature_enabled(session: AsyncSession, feature_key: str = WIKI_FEATURE) -> bool:
    return (await feature_policy(session, feature_key)).enabled


async def require_feature_enabled(session: AsyncSession, feature_key: str = WIKI_FEATURE) -> None:
    if not await feature_enabled(session, feature_key):
        raise HTTPException(
            status_code=403,
            detail={"code": "feature_disabled", "feature": feature_key},
        )
