import uuid

from fastapi import APIRouter, Depends, Response
from sqlalchemy import and_, delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.work_packages import require_wp_member
from app.core.auth import get_current_user
from app.db.session import get_session
from app.models.member import ProjectMember
from app.models.user import User
from app.models.watcher import WpWatcher
from app.schemas.watcher import WatcherList, WatcherRead

router = APIRouter()

# Watching is strictly self-service: you can only add/remove YOURSELF, and only
# on work packages you can see (member — require_wp_member hides existence).


@router.get("/work-packages/{wp_id}/watchers", response_model=WatcherList)
async def list_watchers(
    wp_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WatcherList:
    work_package = await require_wp_member(session, wp_id, user)
    watchers = (
        await session.execute(
            select(User, ProjectMember.user_id.is_not(None).label("is_active_member"))
            .select_from(WpWatcher)
            .join(User, WpWatcher.user_id == User.id)
            .outerjoin(
                ProjectMember,
                and_(
                    ProjectMember.project_id == work_package.project_id,
                    ProjectMember.user_id == User.id,
                ),
            )
            .where(WpWatcher.work_package_id == wp_id)
            .order_by(User.display_name)
        )
    ).all()
    return WatcherList(
        items=[
            WatcherRead(
                user_id=watcher.id,
                display_name=watcher.display_name,
                profile_image_url=(
                    watcher.project_profile_image_url(work_package.project_id)
                    if is_active_member
                    else None
                ),
            )
            for watcher, is_active_member in watchers
        ],
        total=len(watchers),
        me_watching=any(watcher.id == user.id for watcher, _ in watchers),
    )


@router.put("/work-packages/{wp_id}/watchers/me", status_code=204)
async def watch(
    wp_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await require_wp_member(session, wp_id, user, write=True)
    # Idempotent: watching twice is a no-op, never a 409.
    await session.execute(
        pg_insert(WpWatcher)
        .values(id=uuid.uuid4(), work_package_id=wp_id, user_id=user.id)
        .on_conflict_do_nothing(constraint="uq_wp_watchers_wp_user")
    )
    await session.commit()
    return Response(status_code=204)


@router.delete("/work-packages/{wp_id}/watchers/me", status_code=204)
async def unwatch(
    wp_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await require_wp_member(session, wp_id, user, write=True)
    # Idempotent: unwatching when not watching is a no-op.
    await session.execute(
        delete(WpWatcher).where(WpWatcher.work_package_id == wp_id, WpWatcher.user_id == user.id)
    )
    await session.commit()
    return Response(status_code=204)
