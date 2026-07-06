import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.work_packages import require_wp_member
from app.core.auth import get_current_user
from app.db.session import get_session
from app.models.activity import Activity
from app.models.comment import WorkPackageComment
from app.models.user import User
from app.schemas.comment import (
    ActivityList,
    ActivityRead,
    CommentCreate,
    CommentList,
    CommentRead,
)
from app.services.activity import record_comment
from app.services.notification import notify_watchers

router = APIRouter()


@router.get("/work-packages/{wp_id}/comments", response_model=CommentList)
async def list_comments(
    wp_id: uuid.UUID,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CommentList:
    await require_wp_member(session, wp_id, user)
    base = select(WorkPackageComment).where(WorkPackageComment.work_package_id == wp_id)
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        (
            await session.execute(
                base.order_by(WorkPackageComment.created_at.asc()).limit(limit).offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return CommentList(items=[CommentRead.model_validate(c) for c in rows], total=total)


@router.post("/work-packages/{wp_id}/comments", response_model=CommentRead, status_code=201)
async def create_comment(
    wp_id: uuid.UUID,
    body: CommentCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CommentRead:
    wp = await require_wp_member(session, wp_id, user, write=True)
    comment = WorkPackageComment(work_package_id=wp_id, author_id=user.id, body=body.body)
    session.add(comment)
    record_comment(session, wp_id, user.id)  # same transaction as the comment
    # Watchers hear about new comments in the same transaction (PR-E1).
    await notify_watchers(
        session, wp_id=wp_id, project_id=wp.project_id, actor_id=user.id, kind="watch_comment"
    )
    await session.flush()
    await session.commit()
    return CommentRead.model_validate(comment)


@router.get("/work-packages/{wp_id}/activities", response_model=ActivityList)
async def list_activities(
    wp_id: uuid.UUID,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ActivityList:
    await require_wp_member(session, wp_id, user)
    base = select(Activity).where(Activity.work_package_id == wp_id)
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        (
            await session.execute(
                base.order_by(Activity.created_at.asc()).limit(limit).offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return ActivityList(items=[ActivityRead.model_validate(a) for a in rows], total=total)
