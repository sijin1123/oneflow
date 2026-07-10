import uuid

from fastapi import APIRouter, Depends, Response
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.work_packages import require_wp_member
from app.core.auth import get_current_user
from app.db.session import get_session
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
    await require_wp_member(session, wp_id, user)
    rows = (
        await session.execute(
            select(WpWatcher.user_id, User.display_name)
            .join(User, WpWatcher.user_id == User.id)
            .where(WpWatcher.work_package_id == wp_id)
            .order_by(User.display_name)
        )
    ).all()
    return WatcherList(
        items=[WatcherRead(user_id=uid, display_name=name) for (uid, name) in rows],
        total=len(rows),
        me_watching=any(uid == user.id for (uid, _) in rows),
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
