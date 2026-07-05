import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member
from app.db.session import get_session
from app.models.activity import Activity
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.models.work_package import (
    WP_PRIORITIES,
    WP_STATUSES,
    WP_TYPES,
    WorkPackage,
)
from app.schemas.comment import ProjectActivityList, ProjectActivityRead
from app.schemas.dashboard import Bucket, DashboardRead

router = APIRouter()

CLOSED_STATUSES = ("done", "cancelled")


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

    return DashboardRead(
        total_work_packages=total,
        open_work_packages=open_count,
        overdue_count=overdue,
        status_counts=_ordered_buckets(status_counts, WP_STATUSES),
        priority_counts=_ordered_buckets(priority_counts, WP_PRIORITIES),
        type_counts=_ordered_buckets(type_counts, WP_TYPES),
        total_estimated_hours=round(float(estimated), 2),
        total_spent_hours=round(float(spent), 2),
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
