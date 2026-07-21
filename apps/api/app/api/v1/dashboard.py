import csv
import io
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.csv_io import BOM, _guard_formula
from app.core.auth import get_current_user
from app.core.authz import member_role, require_member, require_role
from app.core.dates import utc_today
from app.db.session import get_session
from app.models.activity import ACTIVITY_ACTIONS, Activity
from app.models.cost_entry import CostEntry
from app.models.dashboard_layout import WIDGET_KEYS, DashboardLayout, DashboardSharedLayout
from app.models.project import Project
from app.models.project_type import ProjectType
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.models.work_package import (
    WP_CLOSED_STATUSES,
    WP_PRIORITIES,
    WP_STATUSES,
    WP_TYPES,
    WorkPackage,
)
from app.schemas.comment import ProjectActivityList, ProjectActivityRead
from app.schemas.dashboard import (
    Bucket,
    DashboardLayoutPut,
    DashboardLayoutRead,
    DashboardRead,
    DashboardSharedLayoutPut,
    DashboardSharedLayoutRead,
    RecentWorkPackageRead,
)

router = APIRouter()

# The completion policy lives on the model (WP_CLOSED_STATUSES); local alias
# only keeps the existing references short.
CLOSED_STATUSES = WP_CLOSED_STATUSES


def _normalize_widgets(widgets: list[str]) -> list[str]:
    normalized: list[str] = []
    for key in widgets:
        if key not in WIDGET_KEYS:
            raise HTTPException(status_code=422, detail=f"unknown widget '{key}'")
        if key not in normalized:
            normalized.append(key)
    if not normalized:
        raise HTTPException(status_code=422, detail="at least one widget is required")
    return normalized


def _known_widgets(widgets: list[str]) -> list[str]:
    known: list[str] = []
    for key in widgets:
        if key in WIDGET_KEYS and key not in known:
            known.append(key)
    return known


def _shared_read(row: DashboardSharedLayout | None) -> DashboardSharedLayoutRead | None:
    if row is None:
        return None
    return DashboardSharedLayoutRead(
        widgets=_known_widgets(row.widgets),
        version=row.version,
        updated_at=row.updated_at,
        updated_by_name=row.updated_by_name,
    )


async def _effective_layout(
    session: AsyncSession,
    project_id: uuid.UUID,
    user: User,
) -> DashboardLayoutRead:
    personal = (
        await session.execute(
            select(DashboardLayout).where(
                DashboardLayout.project_id == project_id,
                DashboardLayout.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    shared = (
        await session.execute(
            select(DashboardSharedLayout).where(DashboardSharedLayout.project_id == project_id)
        )
    ).scalar_one_or_none()
    role = await member_role(session, project_id, user.id)
    archived_at = (
        await session.execute(select(Project.archived_at).where(Project.id == project_id))
    ).scalar_one_or_none()
    personal_widgets = [] if personal is None else _known_widgets(personal.widgets)
    shared_widgets = [] if shared is None else _known_widgets(shared.widgets)
    if personal_widgets:
        widgets = personal_widgets
        updated_at = personal.updated_at
        source = "personal"
    elif shared_widgets:
        widgets = shared_widgets
        updated_at = shared.updated_at
        source = "shared"
    else:
        widgets = list(WIDGET_KEYS)
        updated_at = None
        source = "builtin"
    return DashboardLayoutRead(
        widgets=widgets,
        updated_at=updated_at,
        is_default=source == "builtin",
        source=source,
        shared_layout=_shared_read(shared),
        can_manage_shared=role == "owner" and archived_at is None,
    )


def _ordered_buckets(counts: dict[str, int], order: tuple[str, ...] | list[str]) -> list[Bucket]:
    keys = list(order)
    keys.extend(sorted(set(counts) - set(keys)))
    return [Bucket(key=k, count=counts.get(k, 0)) for k in keys]


@router.get("/projects/{project_id}/dashboard", response_model=DashboardRead)
async def project_dashboard(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DashboardRead:
    await require_member(session, project_id, user)
    today = utc_today()  # UTC boundary (v21.1 — unified in Pass 46)
    project = (await session.execute(select(Project).where(Project.id == project_id))).scalar_one()

    async def group(col) -> dict[str, int]:
        rows = (
            await session.execute(
                select(col, func.count()).where(WorkPackage.project_id == project_id).group_by(col)
            )
        ).all()
        return {k: n for (k, n) in rows}

    status_counts = await group(WorkPackage.status)
    priority_counts = await group(WorkPackage.priority)
    type_counts = await group(WorkPackage.type)
    type_order = list(
        (
            await session.execute(
                select(ProjectType.key)
                .where(ProjectType.project_id == project_id)
                .order_by(ProjectType.position.asc(), ProjectType.key.asc())
            )
        ).scalars()
    ) or list(WP_TYPES)

    total = sum(status_counts.values())
    open_count = sum(n for k, n in status_counts.items() if k not in CLOSED_STATUSES)

    overdue = (
        await session.execute(
            select(func.count())
            .select_from(WorkPackage)
            .where(
                WorkPackage.project_id == project_id,
                WorkPackage.due_date.is_not(None),
                WorkPackage.due_date < today,
                WorkPackage.status.not_in(CLOSED_STATUSES),
            )
        )
    ).scalar_one()

    estimated = (
        await session.execute(
            select(func.coalesce(func.sum(WorkPackage.estimated_hours), 0)).where(
                WorkPackage.project_id == project_id
            )
        )
    ).scalar_one()

    spent = (
        await session.execute(
            select(func.coalesce(func.sum(TimeEntry.hours), 0))
            .select_from(TimeEntry)
            .join(WorkPackage, TimeEntry.work_package_id == WorkPackage.id)
            .where(WorkPackage.project_id == project_id)
        )
    ).scalar_one()

    cost = (
        await session.execute(
            select(func.coalesce(func.sum(CostEntry.amount), 0))
            .select_from(CostEntry)
            .join(WorkPackage, CostEntry.work_package_id == WorkPackage.id)
            .where(WorkPackage.project_id == project_id)
        )
    ).scalar_one()
    recent_rows = (
        await session.execute(
            select(WorkPackage, User.display_name)
            .outerjoin(User, WorkPackage.assignee_id == User.id)
            .where(WorkPackage.project_id == project_id)
            .order_by(WorkPackage.updated_at.desc(), WorkPackage.id.desc())
            .limit(5)
        )
    ).all()
    closed_count = total - open_count

    return DashboardRead(
        id=project.id,
        key=project.key,
        name=project.name,
        description=project.description,
        health=project.health,
        health_note=project.health_note,
        archived_at=project.archived_at,
        total_work_packages=total,
        open_work_packages=open_count,
        completion_percent=round((closed_count / total) * 100, 2) if total else 0.0,
        overdue_count=overdue,
        status_counts=_ordered_buckets(status_counts, WP_STATUSES),
        priority_counts=_ordered_buckets(priority_counts, WP_PRIORITIES),
        type_counts=_ordered_buckets(type_counts, type_order),
        total_estimated_hours=round(float(estimated), 2),
        total_spent_hours=round(float(spent), 2),
        budget=round(float(project.budget), 2) if project.budget is not None else None,
        total_cost=round(float(cost), 2),
        recent_work_packages=[
            RecentWorkPackageRead(
                id=wp.id,
                subject=wp.subject,
                status=wp.status,
                priority=wp.priority,
                assignee_name=assignee_name,
                updated_at=wp.updated_at,
            )
            for wp, assignee_name in recent_rows
        ],
    )


@router.get("/projects/{project_id}/activities", response_model=ProjectActivityList)
async def project_activities(
    project_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    action: str | None = Query(default=None),
    field: str | None = Query(default=None, max_length=40),
    actor_id: uuid.UUID | None = Query(default=None),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectActivityList:
    """Project-wide audit feed, enriched with the work package subject and actor
    name (member-scoped). Filters are independent ANDs (v19.1): exact-key
    `field` with action=created/commented yields an empty page, never 422.
    `total` stays the RETURNED count (legacy contract); `truncated` (limit+1
    probe) says whether more rows exist.

    `actor_id` (Pass 38, revising the Pass-19 exclusion): any uuid — an
    unrelated one is a legitimately empty page. Members can already walk the
    whole feed by pagination, so the filter opens no new information channel
    (v38.1 R1-②); ids are exposed as stored, matching the WP activity read."""
    await require_member(session, project_id, user)
    if action is not None and action not in ACTIVITY_ACTIONS:
        raise HTTPException(status_code=422, detail=f"action must be one of {ACTIVITY_ACTIONS}")
    stmt = (
        select(Activity, WorkPackage.subject)
        .join(WorkPackage, Activity.work_package_id == WorkPackage.id)
        .where(WorkPackage.project_id == project_id)
    )
    if action is not None:
        stmt = stmt.where(Activity.action == action)
    if field is not None:
        stmt = stmt.where(Activity.field == field.strip())
    if actor_id is not None:
        stmt = stmt.where(Activity.actor_id == actor_id)
    order_col = Activity.created_at.asc() if order == "asc" else Activity.created_at.desc()
    rows = (
        await session.execute(
            # id ASC tie-breaker keeps equal timestamps deterministic (R1-②).
            stmt.order_by(order_col, Activity.id.asc()).limit(limit + 1)
        )
    ).all()
    truncated = len(rows) > limit
    rows = rows[:limit]
    items = [
        ProjectActivityRead(
            id=a.id,
            work_package_id=a.work_package_id,
            work_package_subject=subject,
            actor_id=a.actor_id,
            actor_name=a.actor_name,
            actor_profile_image_url=a.actor_profile_image_url,
            action=a.action,
            field=a.field,
            old_value=a.old_value,
            new_value=a.new_value,
            created_at=a.created_at,
        )
        for (a, subject) in rows
    ]
    return ProjectActivityList(items=items, total=len(items), truncated=truncated)


@router.get("/projects/{project_id}/dashboard/export.csv")
async def export_dashboard_csv(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    """The dashboard roll-up as CSV (Pass 6 PR-Q). Reads stay open on archived
    projects (same policy as the work-package export); the formula guard and
    UTF-8 BOM follow the existing CSV conventions."""
    data = await project_dashboard(project_id, session, user)  # membership inside

    buf = io.StringIO()
    buf.write(BOM)
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(["section", "key", "value"])

    def row(section: str, key: str, value: object) -> None:
        writer.writerow([_guard_formula(section), _guard_formula(str(key)), value])

    row("summary", "total_work_packages", data.total_work_packages)
    row("summary", "open_work_packages", data.open_work_packages)
    row("summary", "overdue_count", data.overdue_count)
    row("summary", "total_estimated_hours", data.total_estimated_hours)
    row("summary", "total_spent_hours", data.total_spent_hours)
    row("summary", "budget", data.budget if data.budget is not None else "")
    row("summary", "total_cost", data.total_cost)
    for bucket in data.status_counts:
        row("status", bucket.key, bucket.count)
    for bucket in data.priority_counts:
        row("priority", bucket.key, bucket.count)
    for bucket in data.type_counts:
        row("type", bucket.key, bucket.count)

    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="dashboard.csv"'},
    )


@router.get("/projects/{project_id}/dashboard/layout", response_model=DashboardLayoutRead)
async def get_dashboard_layout(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DashboardLayoutRead:
    """Resolve the caller's personal override, then the project shared layout,
    then the built-in layout. Retired keys are ignored safely."""
    await require_member(session, project_id, user)
    return await _effective_layout(session, project_id, user)


@router.put("/projects/{project_id}/dashboard/layout", response_model=DashboardLayoutRead)
async def put_dashboard_layout(
    project_id: uuid.UUID,
    body: DashboardLayoutPut,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DashboardLayoutRead:
    """Upsert of the caller's OWN layout. Deliberately last-write-wins (v18.1
    R1-① — single-owner personal preference, lost updates self-correct) and
    deliberately EXEMPT from the archived-project write gate (R1-③ — a display
    preference, not project data). API normalizes: de-dup keeping the first
    occurrence; vocabulary/empty violations are 422 (DB CHECK is the backstop)."""
    await require_member(session, project_id, user)  # no write=True: archive-exempt
    normalized = _normalize_widgets(body.widgets)
    stmt = (
        pg_insert(DashboardLayout)
        .values(project_id=project_id, user_id=user.id, widgets=normalized)
        .on_conflict_do_update(
            index_elements=["project_id", "user_id"],
            set_={"widgets": normalized, "updated_at": func.now()},
        )
        .returning(DashboardLayout.updated_at)
    )
    try:
        (await session.execute(stmt)).scalar_one()
        await session.commit()
    except IntegrityError as exc:  # project/user deleted mid-flight (R1-④)
        await session.rollback()
        raise HTTPException(status_code=404, detail="not found") from exc
    return await _effective_layout(session, project_id, user)


@router.delete("/projects/{project_id}/dashboard/layout", response_model=DashboardLayoutRead)
async def delete_dashboard_layout(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DashboardLayoutRead:
    """Remove only the caller's personal preference and re-resolve inheritance.

    This remains archive-exempt and available to viewers for the same reason as
    the personal PUT: it changes no project-owned data.
    """
    await require_member(session, project_id, user)
    row = (
        await session.execute(
            select(DashboardLayout).where(
                DashboardLayout.project_id == project_id,
                DashboardLayout.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if row is not None:
        await session.delete(row)
        await session.commit()
    return await _effective_layout(session, project_id, user)


@router.put("/projects/{project_id}/dashboard/shared-layout", response_model=DashboardLayoutRead)
async def put_shared_dashboard_layout(
    project_id: uuid.UUID,
    body: DashboardSharedLayoutPut,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DashboardLayoutRead:
    """Publish or revise the active project's shared layout as its owner."""
    await require_role(session, project_id, user, {"owner"}, write=True)
    normalized = _normalize_widgets(body.widgets)
    project = (
        await session.execute(select(Project).where(Project.id == project_id).with_for_update())
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="not found")
    if project.archived_at is not None:
        raise HTTPException(status_code=409, detail="project is archived")
    shared = (
        await session.execute(
            select(DashboardSharedLayout)
            .where(DashboardSharedLayout.project_id == project_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    current_version = 0 if shared is None else shared.version
    if current_version != body.expected_version:
        raise HTTPException(status_code=409, detail="shared dashboard layout version conflict")
    if shared is None:
        shared = DashboardSharedLayout(
            project_id=project_id,
            widgets=normalized,
            version=1,
            updated_by_user_id=user.id,
            updated_by_name=user.display_name,
        )
        session.add(shared)
    elif _known_widgets(shared.widgets) != normalized:
        shared.widgets = normalized
        shared.version += 1
        shared.updated_by_user_id = user.id
        shared.updated_by_name = user.display_name
        shared.updated_at = func.now()
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="shared dashboard layout version conflict"
        ) from exc
    return await _effective_layout(session, project_id, user)


@router.delete("/projects/{project_id}/dashboard/shared-layout", response_model=DashboardLayoutRead)
async def delete_shared_dashboard_layout(
    project_id: uuid.UUID,
    expected_version: int = Query(ge=1, le=2_147_483_647),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DashboardLayoutRead:
    """Delete the project-owned layout without deleting anyone's override."""
    await require_role(session, project_id, user, {"owner"}, write=True)
    project = (
        await session.execute(select(Project).where(Project.id == project_id).with_for_update())
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="not found")
    if project.archived_at is not None:
        raise HTTPException(status_code=409, detail="project is archived")
    shared = (
        await session.execute(
            select(DashboardSharedLayout)
            .where(DashboardSharedLayout.project_id == project_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if shared is None:
        raise HTTPException(status_code=404, detail="shared dashboard layout not found")
    if shared.version != expected_version:
        raise HTTPException(status_code=409, detail="shared dashboard layout version conflict")
    await session.delete(shared)
    await session.commit()
    return await _effective_layout(session, project_id, user)
