import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.dates import utc_today
from app.db.session import get_session
from app.models.activity import Activity
from app.models.member import ProjectMember
from app.models.notification import Notification
from app.models.notification_setting import UserNotificationSettings
from app.models.project import Project
from app.models.user import User
from app.models.work_package import WP_CLOSED_STATUSES, WorkPackage
from app.schemas.me_work import MeWorkRead, MyActivityRead, MyWorkPackage
from app.schemas.notification import NotificationList, NotificationRead
from app.schemas.notification_setting import (
    NotificationSettingsRead,
    NotificationSettingsUpdate,
)
from app.schemas.user import UserRead

router = APIRouter()

MY_WORK_LIMIT = 50
MY_ACTIVITY_LIMIT = 20
DUE_SOON_DAYS = 7


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)) -> UserRead:
    """The authenticated user (dev user in dev mode). Lets the UI decide which
    per-project controls to show based on the caller's membership role."""
    return UserRead.model_validate(user)


@router.get("/me/work", response_model=MeWorkRead)
async def my_work(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MeWorkRead:
    """Personal cross-project home: my open assignments, the slice due within
    7 days, and recent activity across my projects. Membership is re-evaluated
    inside each query (no caching), so leaving a project hides its work packages
    and activity immediately — even for items still assigned to the caller."""
    membership = select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)

    assignee = User.__table__.alias("assignee")

    def open_work_stmt(*predicates):
        """Common member-visible open-work base (v45.1 R1-②) — the section
        predicates stay separate so they can't contaminate each other."""
        return (
            select(WorkPackage, Project.name, assignee.c.display_name)
            .join(Project, WorkPackage.project_id == Project.id)
            .outerjoin(assignee, WorkPackage.assignee_id == assignee.c.id)
            .where(
                WorkPackage.status.not_in(WP_CLOSED_STATUSES),
                WorkPackage.project_id.in_(membership),
                Project.archived_at.is_(None),  # archived projects rest quietly
                *predicates,
            )
            .order_by(
                WorkPackage.due_date.asc().nulls_last(),
                WorkPackage.created_at,
                WorkPackage.id,
            )
            .limit(MY_WORK_LIMIT)
        )

    def assigned_stmt():
        return open_work_stmt(WorkPackage.assignee_id == user.id)

    def to_item(wp: WorkPackage, project_name: str, assignee_name: str | None) -> MyWorkPackage:
        return MyWorkPackage(
            id=wp.id,
            project_id=wp.project_id,
            project_name=project_name,
            subject=wp.subject,
            type=wp.type,
            status=wp.status,
            priority=wp.priority,
            due_date=wp.due_date,
            assignee_id=wp.assignee_id,
            assignee_name=assignee_name,
        )

    assigned_rows = (await session.execute(assigned_stmt())).all()

    # Delegation view (Pass 45): items I created that are NOT mine to do.
    # The explicit IS NULL keeps unassigned items in (SQL != drops NULLs).
    created_rows = (
        await session.execute(
            open_work_stmt(
                WorkPackage.created_by == user.id,
                (WorkPackage.assignee_id.is_(None)) | (WorkPackage.assignee_id != user.id),
            )
        )
    ).all()

    # UTC boundary (v21.1 — unified in Pass 46; was server-local).
    today = utc_today()
    due_rows = (
        await session.execute(
            assigned_stmt().where(
                WorkPackage.due_date.is_not(None),
                WorkPackage.due_date >= today,
                WorkPackage.due_date <= today + timedelta(days=DUE_SOON_DAYS),
            )
        )
    ).all()

    actor = User.__table__.alias("actor")
    activity_rows = (
        await session.execute(
            select(
                Activity,
                WorkPackage.subject,
                Project.id.label("pid"),
                Project.name.label("pname"),
                actor.c.display_name,
            )
            .join(WorkPackage, Activity.work_package_id == WorkPackage.id)
            .join(Project, WorkPackage.project_id == Project.id)
            .join(
                ProjectMember,
                (ProjectMember.project_id == Project.id) & (ProjectMember.user_id == user.id),
            )
            .outerjoin(actor, Activity.actor_id == actor.c.id)
            .where(Project.archived_at.is_(None))
            .order_by(Activity.created_at.desc(), Activity.id.desc())
            .limit(MY_ACTIVITY_LIMIT)
        )
    ).all()

    return MeWorkRead(
        assigned_to_me=[to_item(wp, name, an) for (wp, name, an) in assigned_rows],
        due_soon=[to_item(wp, name, an) for (wp, name, an) in due_rows],
        created_by_me=[to_item(wp, name, an) for (wp, name, an) in created_rows],
        recent_activity=[
            MyActivityRead(
                id=a.id,
                project_id=pid,
                project_name=pname,
                work_package_id=a.work_package_id,
                work_package_subject=subject,
                actor_name=actor_name,
                action=a.action,
                field=a.field,
                old_value=a.old_value,
                new_value=a.new_value,
                created_at=a.created_at,
            )
            for (a, subject, pid, pname, actor_name) in activity_rows
        ],
    )


@router.get("/me/notification-settings", response_model=NotificationSettingsRead)
async def get_notification_settings(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> NotificationSettingsRead:
    """The caller's own toggles; an absent row means all defaults (True).
    Preferences apply at notification CREATION time only — existing inbox rows
    and unread counts are never retro-affected."""
    row = (
        await session.execute(
            select(UserNotificationSettings).where(UserNotificationSettings.user_id == user.id)
        )
    ).scalar_one_or_none()
    if row is None:
        return NotificationSettingsRead(
            assigned=True,
            watched=True,
            commented=True,
            mention=True,
            due_alerts=True,
            intake=True,
        )
    return NotificationSettingsRead(
        assigned=row.assigned,
        watched=row.watched,
        commented=row.commented,
        mention=row.mention,
        due_alerts=row.due_alerts,
        intake=row.intake,
    )


@router.put("/me/notification-settings", response_model=NotificationSettingsRead)
async def update_notification_settings(
    body: NotificationSettingsUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> NotificationSettingsRead:
    row = (
        await session.execute(
            select(UserNotificationSettings).where(UserNotificationSettings.user_id == user.id)
        )
    ).scalar_one_or_none()
    if row is None:
        row = UserNotificationSettings(user_id=user.id)
        session.add(row)
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(row, key, value)
    await session.commit()
    return NotificationSettingsRead(
        assigned=row.assigned,
        watched=row.watched,
        commented=row.commented,
        mention=row.mention,
        due_alerts=row.due_alerts,
        intake=row.intake,
    )


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
            intake_item_id=n.intake_item_id,
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
