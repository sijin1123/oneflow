import uuid
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy import update as sa_update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.dates import utc_today
from app.db.session import get_session
from app.models.activity import Activity
from app.models.initiative import Initiative, InitiativeProject
from app.models.member import ProjectMember
from app.models.notification import Notification
from app.models.notification_setting import UserNotificationSettings
from app.models.project import Project
from app.models.project_directory_preferences import (
    PROJECT_DIRECTORY_COLUMNS,
    UserProjectDirectoryPreferences,
)
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.models.watcher import WpWatcher
from app.models.work_package import WP_CLOSED_STATUSES, WorkPackage
from app.schemas.me_work import (
    MeWorkRead,
    MyActivityList,
    MyActivityRead,
    MyTimeEntry,
    MyTimeProjectSum,
    MyTimeRead,
    MyWorkItemList,
    MyWorkItemRead,
    MyWorkPackage,
)
from app.schemas.notification import NotificationList, NotificationRead
from app.schemas.notification_setting import (
    NotificationSettingsRead,
    NotificationSettingsUpdate,
)
from app.schemas.project_directory_preferences import (
    ProjectDirectoryPreferencesPut,
    ProjectDirectoryPreferencesRead,
)
from app.schemas.user import UserRead

router = APIRouter()

MY_WORK_LIMIT = 50
MY_ACTIVITY_LIMIT = 20
DUE_SOON_DAYS = 7
DEFAULT_PROJECT_DIRECTORY_COLUMNS = [
    "work_package_count",
    "open_work_package_count",
    "overdue_count",
    "member_count",
]


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)) -> UserRead:
    """The authenticated user (dev user in dev mode). Lets the UI decide which
    per-project controls to show based on the caller's membership role."""
    return UserRead.model_validate(user)


@router.get(
    "/me/project-directory-preferences",
    response_model=ProjectDirectoryPreferencesRead,
)
async def get_project_directory_preferences(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectDirectoryPreferencesRead:
    row = (
        await session.execute(
            select(UserProjectDirectoryPreferences).where(
                UserProjectDirectoryPreferences.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return ProjectDirectoryPreferencesRead(
            columns=DEFAULT_PROJECT_DIRECTORY_COLUMNS,
            sort_key="default",
            sort_direction="asc",
            layout="grid",
            updated_at=None,
            is_default=True,
        )
    return ProjectDirectoryPreferencesRead(
        columns=list(
            dict.fromkeys(column for column in row.columns if column in PROJECT_DIRECTORY_COLUMNS)
        ),
        sort_key=row.sort_key,
        sort_direction=row.sort_direction,
        layout=row.layout,
        updated_at=row.updated_at,
        is_default=False,
    )


@router.put(
    "/me/project-directory-preferences",
    response_model=ProjectDirectoryPreferencesRead,
)
async def put_project_directory_preferences(
    body: ProjectDirectoryPreferencesPut,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectDirectoryPreferencesRead:
    """Last-write-wins storage for this caller's own directory presentation."""
    columns = list(dict.fromkeys(body.columns))
    stmt = (
        pg_insert(UserProjectDirectoryPreferences)
        .values(
            user_id=user.id,
            columns=columns,
            sort_key=body.sort_key,
            sort_direction=body.sort_direction,
            layout=body.layout,
        )
        .on_conflict_do_update(
            index_elements=["user_id"],
            set_={
                "columns": columns,
                "sort_key": body.sort_key,
                "sort_direction": body.sort_direction,
                "layout": body.layout,
                "updated_at": func.now(),
            },
        )
        .returning(UserProjectDirectoryPreferences.updated_at)
    )
    try:
        updated_at = (await session.execute(stmt)).scalar_one()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=404, detail="user not found") from exc
    return ProjectDirectoryPreferencesRead(
        columns=columns,
        sort_key=body.sort_key,
        sort_direction=body.sort_direction,
        layout=body.layout,
        updated_at=updated_at,
        is_default=False,
    )


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


@router.get("/me/work-items", response_model=MyWorkItemList)
async def my_work_items(
    relationship: Literal["assigned", "created", "subscribed"],
    state: Literal["open", "all"] = "open",
    sort: Literal["updated", "due"] = "updated",
    q: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MyWorkItemList:
    """The paginated assigned, created, or subscribed work tab for the caller."""
    assignee = User.__table__.alias("assignee")
    stmt = (
        select(WorkPackage, Project.name, assignee.c.display_name)
        .join(Project, WorkPackage.project_id == Project.id)
        .join(
            ProjectMember,
            (ProjectMember.project_id == Project.id) & (ProjectMember.user_id == user.id),
        )
        .outerjoin(assignee, WorkPackage.assignee_id == assignee.c.id)
        .where(Project.archived_at.is_(None))
    )
    if relationship == "assigned":
        stmt = stmt.where(WorkPackage.assignee_id == user.id)
    elif relationship == "created":
        # Unlike the legacy /me/work delegation card, this tab includes the
        # caller's own assignments as well as work assigned to others.
        stmt = stmt.where(WorkPackage.created_by == user.id)
    else:
        stmt = stmt.join(
            WpWatcher,
            (WpWatcher.work_package_id == WorkPackage.id) & (WpWatcher.user_id == user.id),
        )
    if state == "open":
        stmt = stmt.where(WorkPackage.status.not_in(WP_CLOSED_STATUSES))
    if q is not None:
        stmt = stmt.where(WorkPackage.subject.icontains(q, autoescape=True))

    total = (
        await session.execute(select(func.count()).select_from(stmt.order_by(None).subquery()))
    ).scalar_one()
    if sort == "due":
        stmt = stmt.order_by(
            WorkPackage.due_date.asc().nulls_last(),
            WorkPackage.updated_at.desc(),
            WorkPackage.id.desc(),
        )
    else:
        stmt = stmt.order_by(WorkPackage.updated_at.desc(), WorkPackage.id.desc())
    rows = (await session.execute(stmt.limit(limit).offset(offset))).all()
    return MyWorkItemList(
        items=[
            MyWorkItemRead(
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
                updated_at=wp.updated_at,
            )
            for wp, project_name, assignee_name in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/me/activities", response_model=MyActivityList)
async def my_activities(
    q: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MyActivityList:
    """Paginated activity across projects where the caller is currently a member."""
    actor = User.__table__.alias("actor")
    stmt = (
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
    )
    if q is not None:
        stmt = stmt.where(
            WorkPackage.subject.icontains(q, autoescape=True)
            | Project.name.icontains(q, autoescape=True)
        )
    total = (
        await session.execute(select(func.count()).select_from(stmt.order_by(None).subquery()))
    ).scalar_one()
    rows = (
        await session.execute(
            stmt.order_by(Activity.created_at.desc(), Activity.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return MyActivityList(
        items=[
            MyActivityRead(
                id=activity.id,
                project_id=project_id,
                project_name=project_name,
                work_package_id=activity.work_package_id,
                work_package_subject=subject,
                actor_name=actor_name,
                action=activity.action,
                field=activity.field,
                old_value=activity.old_value,
                new_value=activity.new_value,
                created_at=activity.created_at,
            )
            for activity, subject, project_id, project_name, actor_name in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
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
            initiatives=True,
        )
    return NotificationSettingsRead(
        assigned=row.assigned,
        watched=row.watched,
        commented=row.commented,
        mention=row.mention,
        due_alerts=row.due_alerts,
        intake=row.intake,
        initiatives=row.initiatives,
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
        initiatives=row.initiatives,
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
    visible_project_initiatives = (
        select(InitiativeProject.initiative_id)
        .join(ProjectMember, ProjectMember.project_id == InitiativeProject.project_id)
        .where(ProjectMember.user_id == user.id)
    )
    visible_initiatives = select(Initiative.id).where(
        or_(
            Initiative.owner_id == user.id,
            Initiative.id.in_(visible_project_initiatives),
        )
    )
    notification_is_visible = or_(
        Notification.initiative_id.is_(None),
        Notification.initiative_id.in_(visible_initiatives),
    )
    stmt = (
        select(
            Notification,
            WorkPackage.subject.label("wp_subject"),
            Initiative.name.label("initiative_name"),
            actor.c.display_name.label("actor_name"),
        )
        .select_from(Notification)
        .outerjoin(WorkPackage, Notification.work_package_id == WorkPackage.id)
        .outerjoin(Initiative, Notification.initiative_id == Initiative.id)
        .outerjoin(actor, Notification.actor_id == actor.c.id)
        .where(Notification.user_id == user.id, notification_is_visible)
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
            initiative_id=n.initiative_id,
            work_package_id=n.work_package_id,
            intake_item_id=n.intake_item_id,
            work_package_subject=wp_subject,
            initiative_name=initiative_name,
            actor_name=actor_name,
            read=n.read,
            created_at=n.created_at,
        )
        for n, wp_subject, initiative_name, actor_name in rows
    ]
    unread = (
        await session.execute(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_id == user.id,
                Notification.read.is_(False),
                notification_is_visible,
            )
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


MY_TIME_MAX_RANGE_DAYS = 92


@router.get("/me/time-entries", response_model=MyTimeRead)
async def my_time_entries(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MyTimeRead:
    """The caller's OWN logged time (Pass 53, v53.1): user_id is the only
    ownership filter — entries stay visible after leaving a project (audit/
    billing data). Dates are date-only UTC INCLUSIVE on spent_on; from/to
    come as a pair (one alone is ambiguous → 422); default = the last 7 UTC
    days. Totals cover the whole range; items paginate."""
    if (from_date is None) != (to_date is None):
        raise HTTPException(status_code=422, detail="provide both from and to, or neither")
    if from_date is None:
        to_date = utc_today()
        from_date = to_date - timedelta(days=6)
    assert to_date is not None
    if from_date > to_date:
        raise HTTPException(status_code=422, detail="from must be on or before to")
    if (to_date - from_date).days > MY_TIME_MAX_RANGE_DAYS:
        raise HTTPException(status_code=422, detail=f"range exceeds {MY_TIME_MAX_RANGE_DAYS} days")

    base = (
        select(TimeEntry, WorkPackage.subject, Project.id, Project.name)
        .join(WorkPackage, TimeEntry.work_package_id == WorkPackage.id)
        .join(Project, WorkPackage.project_id == Project.id)
        .where(
            TimeEntry.user_id == user.id,
            TimeEntry.spent_on >= from_date,
            TimeEntry.spent_on <= to_date,
        )
    )
    rows = (
        await session.execute(
            base.order_by(TimeEntry.spent_on.desc(), TimeEntry.id.asc()).limit(limit).offset(offset)
        )
    ).all()
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    # Whole-range aggregates — independent of item pagination (v53.1 R1-②).
    sums = (
        await session.execute(
            select(Project.id, Project.name, func.sum(TimeEntry.hours))
            .select_from(TimeEntry)
            .join(WorkPackage, TimeEntry.work_package_id == WorkPackage.id)
            .join(Project, WorkPackage.project_id == Project.id)
            .where(
                TimeEntry.user_id == user.id,
                TimeEntry.spent_on >= from_date,
                TimeEntry.spent_on <= to_date,
            )
            .group_by(Project.id, Project.name)
            .order_by(func.sum(TimeEntry.hours).desc(), Project.name.asc())
        )
    ).all()
    return MyTimeRead(
        from_date=from_date,
        to_date=to_date,
        items=[
            MyTimeEntry(
                id=e.id,
                work_package_id=e.work_package_id,
                work_package_subject=subject,
                project_id=pid,
                project_name=pname,
                hours=float(e.hours),
                note=e.comment,
                spent_on=e.spent_on,
            )
            for (e, subject, pid, pname) in rows
        ],
        total=total,
        total_hours=float(sum(h for (_, _, h) in sums)),
        by_project=[
            MyTimeProjectSum(project_id=pid, project_name=pname, hours=float(h))
            for (pid, pname, h) in sums
        ],
    )
