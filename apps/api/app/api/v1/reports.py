"""Portfolio report (Pass 63 PR-CC, v63.1).

One fixed cross-project comparison surface for the caller's member projects
(viewer included — a read surface). Each aggregate source is an independent
per-project GROUP BY subquery LEFT JOINed 1:1 onto projects (R1-① — join
multiplication is unrepresentable), and the whole page is ONE statement;
totals are the server-side sum of the returned rows (R1-② — items and totals
share a snapshot by construction). The CSV shares the same query function so
the two exports cannot drift (R1-⑥)."""

import csv
import io
import uuid

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.csv_io import BOM, _guard_formula
from app.api.v1.work_packages import WP_CLOSED_STATUSES
from app.core.auth import get_current_user
from app.core.dates import utc_today
from app.db.session import get_session
from app.models.cost_entry import CostEntry
from app.models.member import ProjectMember
from app.models.milestone import Milestone
from app.models.project import Project
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.report import (
    PortfolioItem,
    PortfolioReportRead,
    PortfolioTimelineItem,
    PortfolioTimelineMilestone,
    PortfolioTimelineRead,
    PortfolioTotals,
)
from app.services.workspace_features import RELEASES_FEATURE, feature_enabled

router = APIRouter()


async def portfolio_query(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    include_archived: bool,
    limit: int,
    offset: int,
) -> PortfolioReportRead:
    """Shared by the JSON endpoint and the CSV export (v63.1 R1-⑥)."""
    open_filter = WorkPackage.status.notin_(WP_CLOSED_STATUSES)
    today_utc = utc_today()  # binds in the API layer, never the DB TZ (v22.1)

    members = (
        select(ProjectMember.project_id, func.count().label("member_count"))
        .group_by(ProjectMember.project_id)
        .subquery()
    )
    wps = (
        select(
            WorkPackage.project_id,
            func.count().label("total"),
            func.count().filter(open_filter).label("open"),
            func.count().filter(open_filter, WorkPackage.due_date < today_utc).label("overdue"),
        )
        .group_by(WorkPackage.project_id)
        .subquery()
    )
    costs = (
        select(WorkPackage.project_id, func.sum(CostEntry.amount).label("cost_total"))
        .join(WorkPackage, CostEntry.work_package_id == WorkPackage.id)
        .group_by(WorkPackage.project_id)
        .subquery()
    )
    hours = (
        select(WorkPackage.project_id, func.sum(TimeEntry.hours).label("hours_total"))
        .join(WorkPackage, TimeEntry.work_package_id == WorkPackage.id)
        .group_by(WorkPackage.project_id)
        .subquery()
    )

    base = (
        select(
            Project.id,
            Project.key,
            Project.name,
            Project.archived_at,
            Project.health,
            Project.budget,
            func.coalesce(members.c.member_count, 0),
            func.coalesce(wps.c.total, 0),
            func.coalesce(wps.c.open, 0),
            func.coalesce(wps.c.overdue, 0),
            func.coalesce(costs.c.cost_total, 0),
            func.coalesce(hours.c.hours_total, 0),
        )
        .join(
            ProjectMember,
            (ProjectMember.project_id == Project.id) & (ProjectMember.user_id == user_id),
        )
        .outerjoin(members, members.c.project_id == Project.id)
        .outerjoin(wps, wps.c.project_id == Project.id)
        .outerjoin(costs, costs.c.project_id == Project.id)
        .outerjoin(hours, hours.c.project_id == Project.id)
    )
    if not include_archived:
        base = base.where(Project.archived_at.is_(None))

    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await session.execute(
            base.order_by(Project.name.asc(), Project.id.asc()).limit(limit).offset(offset)
        )
    ).all()

    items = [
        PortfolioItem(
            project_id=pid,
            key=key,
            name=name,
            archived=archived_at is not None,
            health=health,
            member_count=member_count,
            work_package_count=wp_total,
            open_work_package_count=wp_open,
            overdue_count=wp_overdue,
            budget=budget,
            cost_total=float(cost_total),
            hours_total=float(hours_total),
        )
        for (
            pid,
            key,
            name,
            archived_at,
            health,
            budget,
            member_count,
            wp_total,
            wp_open,
            wp_overdue,
            cost_total,
            hours_total,
        ) in rows
    ]
    totals = PortfolioTotals(
        projects=len(items),
        work_packages=sum(i.work_package_count for i in items),
        open=sum(i.open_work_package_count for i in items),
        overdue=sum(i.overdue_count for i in items),
        budget=sum(i.budget for i in items if i.budget is not None),
        cost_total=sum(i.cost_total for i in items),
        hours_total=sum(i.hours_total for i in items),
    )
    return PortfolioReportRead(items=items, totals=totals, total=total)


@router.get("/reports/portfolio", response_model=PortfolioReportRead)
async def portfolio_report(
    include_archived: bool = Query(default=False),
    limit: int = Query(default=200, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> PortfolioReportRead:
    return await portfolio_query(
        session, user.id, include_archived=include_archived, limit=limit, offset=offset
    )


@router.get("/reports/portfolio/export.csv")
async def export_portfolio_csv(
    include_archived: bool = Query(default=False),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    data = await portfolio_query(
        session, user.id, include_archived=include_archived, limit=200, offset=0
    )
    buf = io.StringIO()
    buf.write(BOM)
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(
        [
            "key",
            "name",
            "archived",
            "health",
            "members",
            "work_packages",
            "open",
            "overdue",
            "budget",
            "cost_total",
            "hours_total",
        ]
    )
    for i in data.items:
        writer.writerow(
            [
                _guard_formula(i.key),
                _guard_formula(i.name),
                "yes" if i.archived else "no",
                _guard_formula(i.health or ""),
                i.member_count,
                i.work_package_count,
                i.open_work_package_count,
                i.overdue_count,
                i.budget if i.budget is not None else "",
                i.cost_total,
                i.hours_total,
            ]
        )
    t = data.totals
    writer.writerow(
        [
            "TOTAL",
            "",
            "",
            "",
            "",
            t.work_packages,
            t.open,
            t.overdue,
            t.budget,
            t.cost_total,
            t.hours_total,
        ]
    )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="portfolio.csv"'},
    )


@router.get("/reports/portfolio/timeline", response_model=PortfolioTimelineRead)
async def portfolio_timeline(
    include_archived: bool = Query(default=False),
    limit: int = Query(default=200, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> PortfolioTimelineRead:
    """Cross-project lanes (Pass 75, v75.1): scope/order/paging are the
    portfolio-report contract (#138); the lane span derives from the
    project's dated work packages via an INDEPENDENT aggregate (min of any
    start/due → max — join multiplication unrepresentable); the open count
    reuses the SAME closed-status predicate; milestones come from ONE batch
    query (dated only)."""
    open_filter = WorkPackage.status.notin_(WP_CLOSED_STATUSES)
    spans = (
        select(
            WorkPackage.project_id,
            func.min(func.coalesce(WorkPackage.start_date, WorkPackage.due_date)).label("start"),
            func.max(func.coalesce(WorkPackage.due_date, WorkPackage.start_date)).label("end"),
            func.count().filter(open_filter).label("open"),
        )
        .group_by(WorkPackage.project_id)
        .subquery()
    )
    base = (
        select(
            Project.id,
            Project.key,
            Project.name,
            Project.archived_at,
            spans.c.start,
            spans.c.end,
            func.coalesce(spans.c.open, 0),
        )
        .join(
            ProjectMember,
            (ProjectMember.project_id == Project.id) & (ProjectMember.user_id == user.id),
        )
        .outerjoin(spans, spans.c.project_id == Project.id)
    )
    if not include_archived:
        base = base.where(Project.archived_at.is_(None))
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await session.execute(
            base.order_by(Project.name.asc(), Project.id.asc()).limit(limit).offset(offset)
        )
    ).all()
    ids = [r[0] for r in rows]
    ms_by_project: dict[uuid.UUID, list[PortfolioTimelineMilestone]] = {}
    if ids and await feature_enabled(session, RELEASES_FEATURE):
        ms_rows = (
            await session.execute(
                select(Milestone.project_id, Milestone.id, Milestone.name, Milestone.due_date)
                .where(Milestone.project_id.in_(ids), Milestone.due_date.is_not(None))
                .order_by(Milestone.due_date.asc(), Milestone.id.asc())
            )
        ).all()
        for pid, mid, name, due in ms_rows:
            ms_by_project.setdefault(pid, []).append(
                PortfolioTimelineMilestone(id=mid, name=name, due_date=due)
            )
    items = [
        PortfolioTimelineItem(
            project_id=pid,
            key=key,
            name=name,
            archived=archived_at is not None,
            start_date=start,
            end_date=end,
            open_work_package_count=open_count,
            milestones=ms_by_project.get(pid, []),
        )
        for (pid, key, name, archived_at, start, end, open_count) in rows
    ]
    return PortfolioTimelineRead(items=items, total=total)
