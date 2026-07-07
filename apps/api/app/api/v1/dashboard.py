import csv
import io
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.csv_io import BOM, _guard_formula
from app.core.auth import get_current_user
from app.core.authz import require_member
from app.db.session import get_session
from app.models.activity import Activity
from app.models.cost_entry import CostEntry
from app.models.dashboard_layout import WIDGET_KEYS, DashboardLayout
from app.models.project import Project
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
from app.schemas.dashboard import Bucket, DashboardLayoutPut, DashboardLayoutRead, DashboardRead

router = APIRouter()

# The completion policy lives on the model (WP_CLOSED_STATUSES); local alias
# only keeps the existing references short.
CLOSED_STATUSES = WP_CLOSED_STATUSES


def _ordered_buckets(counts: dict[str, int], order: tuple[str, ...]) -> list[Bucket]:
    return [Bucket(key=k, count=counts.get(k, 0)) for k in order]


@router.get("/projects/{project_id}/dashboard", response_model=DashboardRead)
async def project_dashboard(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DashboardRead:
    await require_member(session, project_id, user)
    today = date.today()

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
    budget = (
        await session.execute(select(Project.budget).where(Project.id == project_id))
    ).scalar_one_or_none()

    return DashboardRead(
        total_work_packages=total,
        open_work_packages=open_count,
        overdue_count=overdue,
        status_counts=_ordered_buckets(status_counts, WP_STATUSES),
        priority_counts=_ordered_buckets(priority_counts, WP_PRIORITIES),
        type_counts=_ordered_buckets(type_counts, WP_TYPES),
        total_estimated_hours=round(float(estimated), 2),
        total_spent_hours=round(float(spent), 2),
        budget=round(float(budget), 2) if budget is not None else None,
        total_cost=round(float(cost), 2),
    )


@router.get("/projects/{project_id}/activities", response_model=ProjectActivityList)
async def project_activities(
    project_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectActivityList:
    """Project-wide audit feed: every work-package activity in the project, newest
    first, enriched with the work package subject and actor name (member-scoped)."""
    await require_member(session, project_id, user)
    rows = (
        await session.execute(
            select(Activity, WorkPackage.subject, User.display_name)
            .join(WorkPackage, Activity.work_package_id == WorkPackage.id)
            .outerjoin(User, Activity.actor_id == User.id)
            .where(WorkPackage.project_id == project_id)
            .order_by(Activity.created_at.desc())
            .limit(limit)
        )
    ).all()
    items = [
        ProjectActivityRead(
            id=a.id,
            work_package_id=a.work_package_id,
            work_package_subject=subject,
            actor_name=actor_name,
            action=a.action,
            field=a.field,
            old_value=a.old_value,
            new_value=a.new_value,
            created_at=a.created_at,
        )
        for (a, subject, actor_name) in rows
    ]
    return ProjectActivityList(items=items, total=len(items))


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
    """The caller's OWN layout; absent row = the built-in default. Unknown keys
    (a widget retired by a later migration) are filtered out; if nothing
    survives, the default backfills (v18.1 R1-⑥)."""
    await require_member(session, project_id, user)
    row = (
        await session.execute(
            select(DashboardLayout).where(
                DashboardLayout.project_id == project_id, DashboardLayout.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return DashboardLayoutRead(widgets=list(WIDGET_KEYS), updated_at=None, is_default=True)
    known = [w for w in row.widgets if w in WIDGET_KEYS]
    if not known:
        return DashboardLayoutRead(widgets=list(WIDGET_KEYS), updated_at=None, is_default=True)
    return DashboardLayoutRead(widgets=known, updated_at=row.updated_at, is_default=False)


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
    normalized: list[str] = []
    for key in body.widgets:
        if key not in WIDGET_KEYS:
            raise HTTPException(status_code=422, detail=f"unknown widget '{key}'")
        if key not in normalized:
            normalized.append(key)
    if not normalized:
        raise HTTPException(status_code=422, detail="at least one widget is required")
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
        updated_at = (await session.execute(stmt)).scalar_one()
        await session.commit()
    except IntegrityError as exc:  # project/user deleted mid-flight (R1-④)
        await session.rollback()
        raise HTTPException(status_code=404, detail="not found") from exc
    return DashboardLayoutRead(widgets=normalized, updated_at=updated_at, is_default=False)
