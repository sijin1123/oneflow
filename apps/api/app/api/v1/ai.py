"""AI features (PLAN §3 Phase 3 AI/RAG) — feature-flagged, default OFF.

The summary uses a local, secret-free provider; the flag gates the whole feature so
nothing AI-related runs (or appears in the UI) unless an operator opts in.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import is_member
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.activity import Activity
from app.models.comment import WorkPackageComment
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.ai import AiCapabilities, AiSummaryResponse
from app.services.ai_summary import PROVIDER, summarize_work_package

router = APIRouter()


@router.get("/capabilities", response_model=AiCapabilities)
async def capabilities(
    settings: Settings = Depends(get_settings),
    user: User = Depends(get_current_user),
) -> AiCapabilities:
    """Runtime feature flags the UI reads to decide which optional controls to show."""
    return AiCapabilities(ai_summary_enabled=settings.ai_summary_enabled)


@router.post("/work-packages/{wp_id}/summary", response_model=AiSummaryResponse)
async def summarize(
    wp_id: uuid.UUID,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AiSummaryResponse:
    if not settings.ai_summary_enabled:
        raise HTTPException(status_code=503, detail="AI 요약 기능이 비활성화되어 있습니다")

    wp = (
        await session.execute(select(WorkPackage).where(WorkPackage.id == wp_id))
    ).scalar_one_or_none()
    if wp is None or not await is_member(session, wp.project_id, user.id):
        raise HTTPException(status_code=404, detail="not found")

    comment_count = (
        await session.execute(
            select(func.count())
            .select_from(WorkPackageComment)
            .where(WorkPackageComment.work_package_id == wp_id)
        )
    ).scalar_one()
    activity_count = (
        await session.execute(
            select(func.count()).select_from(Activity).where(Activity.work_package_id == wp_id)
        )
    ).scalar_one()

    text = summarize_work_package(wp, comment_count, activity_count)
    return AiSummaryResponse(work_package_id=wp.id, summary=text, provider=PROVIDER)
