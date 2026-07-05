import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_session
from app.models.notification import Notification
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.notification import NotificationList, NotificationRead
from app.schemas.user import UserRead

router = APIRouter()


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)) -> UserRead:
    """The authenticated user (dev user in dev mode). Lets the UI decide which
    per-project controls to show based on the caller's membership role."""
    return UserRead.model_validate(user)


@router.get("/me/notifications", response_model=NotificationList)
async def list_notifications(
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> NotificationList:
    """Current user's inbox, newest first, with the work package subject and actor
    name joined for display. `unread` is always the true unread total so the bell
    badge is correct even when the list is filtered."""
    actor = User.__table__.alias("actor")
    stmt = (
        select(
            Notification,
            WorkPackage.subject.label("wp_subject"),
            actor.c.display_name.label("actor_name"),
        )
        .select_from(Notification)
        .outerjoin(WorkPackage, Notification.work_package_id == WorkPackage.id)
        .outerjoin(actor, Notification.actor_id == actor.c.id)
        .where(Notification.user_id == user.id)
    )
    if unread_only:
        stmt = stmt.where(Notification.read.is_(False))
    stmt = stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit)

    rows = (await session.execute(stmt)).all()
    items = [
        NotificationRead(
            id=n.id,
            kind=n.kind,
            project_id=n.project_id,
            work_package_id=n.work_package_id,
            work_package_subject=wp_subject,
            actor_name=actor_name,
            read=n.read,
            created_at=n.created_at,
        )
        for n, wp_subject, actor_name in rows
    ]
    unread = (
        await session.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user.id, Notification.read.is_(False))
        )
    ).scalar_one()
    return NotificationList(items=items, total=len(items), unread=unread)


@router.post("/me/notifications/{notification_id}/read", status_code=204)
async def mark_notification_read(
    notification_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    # Ownership is enforced in the WHERE clause: a row belonging to another user
    # matches nothing → 404 (existence hiding), never someone else's mutation.
    result = await session.execute(
        sa_update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == user.id)
        .values(read=True)
    )
    await session.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="not found")
    return Response(status_code=204)


@router.post("/me/notifications/read-all", status_code=204)
async def mark_all_notifications_read(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await session.execute(
        sa_update(Notification)
        .where(Notification.user_id == user.id, Notification.read.is_(False))
        .values(read=True)
    )
    await session.commit()
    return Response(status_code=204)
