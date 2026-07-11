"""Workspace-wide time-entry audit log for workspace administrators."""

import csv
import io
import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import Select, func, literal, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.csv_io import BOM, _guard_formula
from app.core.auth import get_current_user
from app.db.session import get_session
from app.models.project import Project
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.admin_worklog import (
    AdminWorklogList,
    AdminWorklogOptions,
    AdminWorklogProjectOption,
    AdminWorklogRead,
    AdminWorklogUserOption,
)

router = APIRouter()
CSV_ROW_CAP = 50_000


def _require_admin(user: User) -> None:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="workspace admin required")


@dataclass(frozen=True)
class WorklogFilters:
    from_date: date
    to_date: date
    user_id: uuid.UUID | None
    deleted_user: bool
    project_id: uuid.UUID | None


def _parse_filters(
    from_date: date,
    to_date: date,
    user_id: str | None,
    project_id: uuid.UUID | None,
) -> WorklogFilters:
    if from_date > to_date:
        raise HTTPException(status_code=422, detail="from must be on or before to")
    if (to_date - from_date).days > 365:
        raise HTTPException(status_code=422, detail="date range must not exceed 366 days")

    deleted_user = user_id == "deleted"
    parsed_user_id = None
    if user_id is not None and not deleted_user:
        try:
            parsed_user_id = uuid.UUID(user_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=422, detail="user_id must be a UUID or 'deleted'"
            ) from exc
    return WorklogFilters(from_date, to_date, parsed_user_id, deleted_user, project_id)


def _filtered_worklogs(filters: WorklogFilters) -> Select:
    stmt = (
        select(
            TimeEntry.id.label("id"),
            TimeEntry.work_package_id.label("work_package_id"),
            WorkPackage.subject.label("work_package_subject"),
            Project.id.label("project_id"),
            Project.key.label("project_key"),
            Project.name.label("project_name"),
            Project.archived_at.is_not(None).label("project_is_archived"),
            TimeEntry.user_id.label("user_id"),
            User.display_name.label("user_display_name"),
            User.email.label("user_email"),
            User.is_active.label("user_is_active"),
            TimeEntry.hours.label("hours"),
            TimeEntry.spent_on.label("spent_on"),
            TimeEntry.comment.label("comment"),
            TimeEntry.created_at.label("created_at"),
        )
        .join(WorkPackage, WorkPackage.id == TimeEntry.work_package_id)
        .join(Project, Project.id == WorkPackage.project_id)
        .outerjoin(User, User.id == TimeEntry.user_id)
        .where(TimeEntry.spent_on.between(filters.from_date, filters.to_date))
    )
    if filters.deleted_user:
        stmt = stmt.where(TimeEntry.user_id.is_(None))
    elif filters.user_id is not None:
        stmt = stmt.where(TimeEntry.user_id == filters.user_id)
    if filters.project_id is not None:
        stmt = stmt.where(Project.id == filters.project_id)
    return stmt


async def _fetch_worklogs(
    session: AsyncSession, filters: WorklogFilters, limit: int, offset: int
) -> tuple[list[AdminWorklogRead], int, float]:
    """Fetch the page and unpaged totals in one CTE query, even past the last page."""
    filtered = _filtered_worklogs(filters).cte("filtered_worklogs")
    summary = (
        select(
            func.count(filtered.c.id).label("total"),
            func.coalesce(func.sum(filtered.c.hours), literal(0)).label("total_hours"),
        )
        .select_from(filtered)
        .cte("worklog_summary")
    )
    page = (
        select(filtered)
        .order_by(
            filtered.c.spent_on.desc(),
            filtered.c.created_at.desc(),
            filtered.c.id.desc(),
        )
        .limit(limit)
        .offset(offset)
        .cte("worklog_page")
    )
    result = await session.execute(
        select(summary.c.total, summary.c.total_hours, *page.c)
        .select_from(summary.outerjoin(page, true()))
        .order_by(page.c.spent_on.desc(), page.c.created_at.desc(), page.c.id.desc())
    )
    rows = result.mappings().all()
    total = int(rows[0]["total"])
    total_hours = float(rows[0]["total_hours"] or Decimal("0"))
    items = [AdminWorklogRead.model_validate(row) for row in rows if row["id"] is not None]
    return items, total, total_hours


@router.get("/admin/worklogs/options", response_model=AdminWorklogOptions)
async def worklog_options(
    session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)
) -> AdminWorklogOptions:
    _require_admin(user)
    users = (
        (await session.execute(select(User).order_by(User.display_name.asc(), User.id.asc())))
        .scalars()
        .all()
    )
    projects = (
        (await session.execute(select(Project).order_by(Project.key.asc(), Project.id.asc())))
        .scalars()
        .all()
    )
    return AdminWorklogOptions(
        users=[
            AdminWorklogUserOption(
                id=row.id,
                display_name=row.display_name,
                email=row.email,
                is_active=row.is_active,
            )
            for row in users
        ],
        projects=[
            AdminWorklogProjectOption(
                id=row.id, key=row.key, name=row.name, is_archived=row.archived_at is not None
            )
            for row in projects
        ],
    )


@router.get("/admin/worklogs", response_model=AdminWorklogList)
async def list_worklogs(
    from_date: date = Query(alias="from"),
    to_date: date = Query(alias="to"),
    user_id: str | None = None,
    project_id: uuid.UUID | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AdminWorklogList:
    _require_admin(user)
    filters = _parse_filters(from_date, to_date, user_id, project_id)
    items, total, total_hours = await _fetch_worklogs(session, filters, limit, offset)
    return AdminWorklogList(
        from_date=from_date,
        to_date=to_date,
        items=items,
        total=total,
        total_hours=total_hours,
        limit=limit,
        offset=offset,
    )


@router.get("/admin/worklogs/export.csv")
async def export_worklogs(
    from_date: date = Query(alias="from"),
    to_date: date = Query(alias="to"),
    user_id: str | None = None,
    project_id: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    _require_admin(user)
    filters = _parse_filters(from_date, to_date, user_id, project_id)
    items, total, _ = await _fetch_worklogs(session, filters, CSV_ROW_CAP + 1, 0)
    if total > CSV_ROW_CAP:
        raise HTTPException(status_code=422, detail=f"CSV export exceeds {CSV_ROW_CAP} rows")

    buf = io.StringIO(newline="")
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(
        [
            "id",
            "spent_on",
            "created_at",
            "hours",
            "user_id",
            "user_display_name",
            "user_email",
            "user_is_active",
            "project_id",
            "project_key",
            "project_name",
            "project_is_archived",
            "work_package_id",
            "work_package_subject",
            "comment",
        ]
    )
    for item in items:
        writer.writerow(
            [
                _guard_formula(str(item.id)),
                _guard_formula(item.spent_on.isoformat()),
                _guard_formula(item.created_at.isoformat()),
                item.hours,
                _guard_formula("" if item.user_id is None else str(item.user_id)),
                _guard_formula(item.user_display_name or ""),
                _guard_formula(item.user_email or ""),
                "" if item.user_is_active is None else str(item.user_is_active).lower(),
                _guard_formula(str(item.project_id)),
                _guard_formula(item.project_key),
                _guard_formula(item.project_name),
                str(item.project_is_archived).lower(),
                _guard_formula(str(item.work_package_id)),
                _guard_formula(item.work_package_subject),
                _guard_formula(item.comment or ""),
            ]
        )
    filename = f"oneflow-worklogs-{from_date.isoformat()}-to-{to_date.isoformat()}.csv"
    return Response(
        content=BOM + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
