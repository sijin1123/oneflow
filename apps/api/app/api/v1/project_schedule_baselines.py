"""Bounded project schedule baseline history and variance lifecycle."""

import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import and_, case, delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.auth import get_current_user
from app.core.authz import require_member, require_role
from app.db.session import get_session
from app.models.project_schedule_baseline import (
    ProjectScheduleBaseline,
    ProjectScheduleBaselineItem,
)
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.project_schedule_baseline import (
    ProjectScheduleBaselineCreate,
    ProjectScheduleBaselineList,
    ProjectScheduleBaselineListItem,
    ProjectScheduleBaselineMutation,
    ProjectScheduleBaselineRead,
    ProjectScheduleBaselineSummary,
    ProjectScheduleVarianceItem,
    ScheduleVarianceState,
)

router = APIRouter()
BASELINE_ITEM_LIMIT = 5_000
BASELINE_HISTORY_LIMIT = 20
VARIANCE_DETAIL_LIMIT = 50
SCHEDULE_BASELINE_LOCK_CLASSID = 427022
VARIANCE_STATES = (
    "unchanged",
    "later",
    "earlier",
    "unscheduled",
    "rescheduled",
    "added",
    "removed",
)


async def _lock_project(session: AsyncSession, project_id: uuid.UUID) -> None:
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:classid, hashtext(:pid))").bindparams(
            classid=SCHEDULE_BASELINE_LOCK_CLASSID, pid=str(project_id)
        )
    )


async def _current_items(session: AsyncSession, project_id: uuid.UUID):
    rows = (
        await session.execute(
            select(
                WorkPackage.id,
                WorkPackage.subject,
                WorkPackage.start_date,
                WorkPackage.due_date,
            )
            .where(WorkPackage.project_id == project_id)
            .order_by(WorkPackage.id)
            .limit(BASELINE_ITEM_LIMIT + 1)
        )
    ).all()
    if len(rows) > BASELINE_ITEM_LIMIT:
        raise HTTPException(
            status_code=409,
            detail=f"schedule baseline supports at most {BASELINE_ITEM_LIMIT} work items",
        )
    return rows


def _variance_days(
    baseline_start: date | None,
    baseline_due: date | None,
    current_start: date | None,
    current_due: date | None,
) -> int | None:
    if baseline_due is not None and current_due is not None:
        return (current_due - baseline_due).days
    if baseline_start is not None and current_start is not None:
        return (current_start - baseline_start).days
    return None


def _classify(snapshot, current) -> tuple[ScheduleVarianceState, int | None]:
    if snapshot is None:
        return "added", None
    if current is None:
        return "removed", None
    baseline_start, baseline_due = snapshot.start_date, snapshot.due_date
    current_start, current_due = current.start_date, current.due_date
    if (baseline_start, baseline_due) == (current_start, current_due):
        return "unchanged", 0
    baseline_scheduled = baseline_start is not None or baseline_due is not None
    current_scheduled = current_start is not None or current_due is not None
    if baseline_scheduled and not current_scheduled:
        return "unscheduled", None
    if not baseline_scheduled and current_scheduled:
        return "rescheduled", None
    delta = _variance_days(baseline_start, baseline_due, current_start, current_due)
    if delta is not None and delta > 0:
        return "later", delta
    if delta is not None and delta < 0:
        return "earlier", delta
    return "rescheduled", delta


async def _summary(
    session: AsyncSession,
    project_id: uuid.UUID,
    baseline: ProjectScheduleBaseline | None,
) -> ProjectScheduleBaselineSummary:
    if baseline is None:
        current_rows = await _current_items(session, project_id)
        return ProjectScheduleBaselineSummary(
            baseline=None,
            total_snapshot=0,
            current_total=len(current_rows),
            unchanged=0,
            later=0,
            earlier=0,
            unscheduled=0,
            rescheduled=0,
            added=0,
            removed=0,
            changed_total=0,
            items=[],
            items_truncated=False,
        )
    snapshot_rows = (
        (
            await session.execute(
                select(ProjectScheduleBaselineItem)
                .where(ProjectScheduleBaselineItem.baseline_id == baseline.id)
                .order_by(ProjectScheduleBaselineItem.work_package_id)
            )
        )
        .scalars()
        .all()
    )
    current_rows = await _current_items(session, project_id)
    snapshots = {row.work_package_id: row for row in snapshot_rows}
    current = {row.id: row for row in current_rows}
    counts = {state: 0 for state in VARIANCE_STATES}
    details: list[ProjectScheduleVarianceItem] = []
    state_order = {
        "later": 0,
        "unscheduled": 1,
        "removed": 2,
        "rescheduled": 3,
        "added": 4,
        "earlier": 5,
        "unchanged": 6,
    }
    for work_package_id in sorted(set(snapshots) | set(current), key=str):
        snapshot = snapshots.get(work_package_id)
        current_item = current.get(work_package_id)
        state, delta = _classify(snapshot, current_item)
        counts[state] += 1
        if state == "unchanged":
            continue
        details.append(
            ProjectScheduleVarianceItem(
                work_package_id=work_package_id,
                subject=current_item.subject if current_item is not None else snapshot.subject,
                state=state,
                variance_days=delta,
                baseline_start_date=snapshot.start_date if snapshot is not None else None,
                baseline_due_date=snapshot.due_date if snapshot is not None else None,
                current_start_date=current_item.start_date if current_item is not None else None,
                current_due_date=current_item.due_date if current_item is not None else None,
            )
        )
    details.sort(
        key=lambda item: (
            state_order[item.state],
            item.subject.casefold(),
            str(item.work_package_id),
        )
    )
    changed_total = len(details)
    return ProjectScheduleBaselineSummary(
        baseline=ProjectScheduleBaselineRead(
            id=baseline.id,
            name=baseline.name,
            version=baseline.version,
            captured_at=baseline.captured_at,
            captured_by_user_id=baseline.captured_by_user_id,
        ),
        total_snapshot=len(snapshot_rows),
        current_total=len(current_rows),
        changed_total=changed_total,
        items=details[:VARIANCE_DETAIL_LIMIT],
        items_truncated=changed_total > VARIANCE_DETAIL_LIMIT,
        **counts,
    )


async def _baseline_for_update(
    session: AsyncSession,
    project_id: uuid.UUID,
    baseline_id: uuid.UUID | None = None,
) -> ProjectScheduleBaseline | None:
    query = select(ProjectScheduleBaseline).where(ProjectScheduleBaseline.project_id == project_id)
    if baseline_id is not None:
        query = query.where(ProjectScheduleBaseline.id == baseline_id)
    else:
        query = query.order_by(
            ProjectScheduleBaseline.captured_at.desc(),
            ProjectScheduleBaseline.id.desc(),
        ).limit(1)
    return (await session.execute(query.with_for_update())).scalar_one_or_none()


async def _latest_baseline(
    session: AsyncSession, project_id: uuid.UUID
) -> ProjectScheduleBaseline | None:
    return (
        await session.execute(
            select(ProjectScheduleBaseline)
            .where(ProjectScheduleBaseline.project_id == project_id)
            .order_by(
                ProjectScheduleBaseline.captured_at.desc(),
                ProjectScheduleBaseline.id.desc(),
            )
            .limit(1)
        )
    ).scalar_one_or_none()


async def _capture_items(
    session: AsyncSession,
    project_id: uuid.UUID,
    baseline: ProjectScheduleBaseline,
) -> None:
    rows = await _current_items(session, project_id)
    session.add_all(
        [
            ProjectScheduleBaselineItem(
                baseline_id=baseline.id,
                work_package_id=row.id,
                subject=row.subject,
                start_date=row.start_date,
                due_date=row.due_date,
            )
            for row in rows
        ]
    )


async def _name_exists(
    session: AsyncSession,
    project_id: uuid.UUID,
    name: str,
) -> bool:
    return (
        await session.execute(
            select(ProjectScheduleBaseline.id)
            .where(
                ProjectScheduleBaseline.project_id == project_id,
                func.lower(ProjectScheduleBaseline.name) == func.lower(name),
            )
            .limit(1)
        )
    ).scalar_one_or_none() is not None


async def _baseline_trend_counts(
    session: AsyncSession,
    project_id: uuid.UUID,
    baseline_ids: list[uuid.UUID],
) -> dict[uuid.UUID, dict[str, int]]:
    """Compare each bounded baseline with the current project schedule in SQL."""
    if not baseline_ids:
        return {}

    snapshot = aliased(ProjectScheduleBaselineItem)
    current = aliased(WorkPackage)
    added_current = aliased(WorkPackage)
    added_snapshot = aliased(ProjectScheduleBaselineItem)

    baseline_scheduled = or_(snapshot.start_date.is_not(None), snapshot.due_date.is_not(None))
    current_scheduled = or_(current.start_date.is_not(None), current.due_date.is_not(None))
    same_dates = and_(
        snapshot.start_date.is_not_distinct_from(current.start_date),
        snapshot.due_date.is_not_distinct_from(current.due_date),
    )
    variance_days = case(
        (
            and_(snapshot.due_date.is_not(None), current.due_date.is_not(None)),
            current.due_date - snapshot.due_date,
        ),
        (
            and_(snapshot.start_date.is_not(None), current.start_date.is_not(None)),
            current.start_date - snapshot.start_date,
        ),
        else_=None,
    )
    state = case(
        (current.id.is_(None), "removed"),
        (same_dates, "unchanged"),
        (and_(baseline_scheduled, ~current_scheduled), "unscheduled"),
        (and_(~baseline_scheduled, current_scheduled), "rescheduled"),
        (variance_days > 0, "later"),
        (variance_days < 0, "earlier"),
        else_="rescheduled",
    )
    added_count = (
        select(func.count(added_current.id))
        .where(
            added_current.project_id == ProjectScheduleBaseline.project_id,
            ~select(added_snapshot.work_package_id)
            .where(
                added_snapshot.baseline_id == ProjectScheduleBaseline.id,
                added_snapshot.work_package_id == added_current.id,
            )
            .exists(),
        )
        .correlate(ProjectScheduleBaseline)
        .scalar_subquery()
    )
    snapshot_count = func.count(snapshot.work_package_id)
    snapshot_changed = func.count(snapshot.work_package_id).filter(state != "unchanged")
    risk_count = func.count(snapshot.work_package_id).filter(
        state.in_(("later", "unscheduled", "removed"))
    )
    rows = (
        await session.execute(
            select(
                ProjectScheduleBaseline.id,
                snapshot_count.label("snapshot_count"),
                (snapshot_count + added_count).label("comparison_total"),
                (snapshot_changed + added_count).label("changed_total"),
                risk_count.label("risk_total"),
            )
            .select_from(ProjectScheduleBaseline)
            .outerjoin(snapshot, snapshot.baseline_id == ProjectScheduleBaseline.id)
            .outerjoin(
                current,
                and_(
                    current.project_id == ProjectScheduleBaseline.project_id,
                    current.id == snapshot.work_package_id,
                ),
            )
            .where(
                ProjectScheduleBaseline.project_id == project_id,
                ProjectScheduleBaseline.id.in_(baseline_ids),
            )
            .group_by(ProjectScheduleBaseline.id, ProjectScheduleBaseline.project_id)
        )
    ).all()
    return {
        baseline_id: {
            "total_snapshot": int(total_snapshot),
            "comparison_total": int(comparison_total),
            "changed_total": int(changed_total),
            "risk_total": int(risk_total),
        }
        for baseline_id, total_snapshot, comparison_total, changed_total, risk_total in rows
    }


@router.get(
    "/projects/{project_id}/schedule-baseline",
    response_model=ProjectScheduleBaselineSummary,
)
async def get_project_schedule_baseline(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectScheduleBaselineSummary:
    await require_member(session, project_id, user)
    baseline = await _latest_baseline(session, project_id)
    return await _summary(session, project_id, baseline)


@router.get(
    "/projects/{project_id}/schedule-baselines",
    response_model=ProjectScheduleBaselineList,
)
async def list_project_schedule_baselines(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectScheduleBaselineList:
    await require_member(session, project_id, user)
    baselines = (
        (
            await session.execute(
                select(ProjectScheduleBaseline)
                .where(ProjectScheduleBaseline.project_id == project_id)
                .order_by(
                    ProjectScheduleBaseline.captured_at.desc(),
                    ProjectScheduleBaseline.id.desc(),
                )
                .limit(BASELINE_HISTORY_LIMIT)
            )
        )
        .scalars()
        .all()
    )
    total = int(
        (
            await session.execute(
                select(func.count(ProjectScheduleBaseline.id)).where(
                    ProjectScheduleBaseline.project_id == project_id
                )
            )
        ).scalar_one()
    )
    current_total = len(await _current_items(session, project_id))
    trend_counts = await _baseline_trend_counts(
        session,
        project_id,
        [baseline.id for baseline in baselines],
    )
    return ProjectScheduleBaselineList(
        items=[
            ProjectScheduleBaselineListItem(
                id=baseline.id,
                name=baseline.name,
                version=baseline.version,
                captured_at=baseline.captured_at,
                captured_by_user_id=baseline.captured_by_user_id,
                **trend_counts.get(
                    baseline.id,
                    {
                        "total_snapshot": 0,
                        "comparison_total": current_total,
                        "changed_total": current_total,
                        "risk_total": 0,
                    },
                ),
            )
            for baseline in baselines
        ],
        total=total,
        current_total=current_total,
        limit=BASELINE_HISTORY_LIMIT,
    )


@router.post(
    "/projects/{project_id}/schedule-baselines",
    response_model=ProjectScheduleBaselineSummary,
    status_code=201,
    responses={403: {}, 409: {}},
)
async def create_project_schedule_baseline(
    project_id: uuid.UUID,
    body: ProjectScheduleBaselineCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectScheduleBaselineSummary:
    await require_role(session, project_id, user, {"owner"}, write=True)
    await _lock_project(session, project_id)
    count = int(
        (
            await session.execute(
                select(func.count(ProjectScheduleBaseline.id)).where(
                    ProjectScheduleBaseline.project_id == project_id
                )
            )
        ).scalar_one()
    )
    if count >= BASELINE_HISTORY_LIMIT:
        raise HTTPException(
            status_code=409,
            detail=f"schedule baseline history supports at most {BASELINE_HISTORY_LIMIT} entries",
        )
    if await _name_exists(session, project_id, body.name):
        raise HTTPException(status_code=409, detail="schedule baseline name already exists")
    baseline = ProjectScheduleBaseline(
        project_id=project_id,
        name=body.name,
        captured_by_user_id=user.id,
    )
    session.add(baseline)
    await session.flush()
    await _capture_items(session, project_id, baseline)
    await session.commit()
    await session.refresh(baseline)
    return await _summary(session, project_id, baseline)


@router.get(
    "/projects/{project_id}/schedule-baselines/{baseline_id}",
    response_model=ProjectScheduleBaselineSummary,
)
async def get_project_schedule_baseline_history_entry(
    project_id: uuid.UUID,
    baseline_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectScheduleBaselineSummary:
    await require_member(session, project_id, user)
    baseline = (
        await session.execute(
            select(ProjectScheduleBaseline).where(
                ProjectScheduleBaseline.project_id == project_id,
                ProjectScheduleBaseline.id == baseline_id,
            )
        )
    ).scalar_one_or_none()
    if baseline is None:
        raise HTTPException(status_code=404, detail="schedule baseline not found")
    return await _summary(session, project_id, baseline)


@router.delete(
    "/projects/{project_id}/schedule-baselines/{baseline_id}",
    status_code=204,
    responses={403: {}, 404: {}, 409: {}},
)
async def delete_project_schedule_baseline_history_entry(
    project_id: uuid.UUID,
    baseline_id: uuid.UUID,
    expected_version: int = Query(ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await require_role(session, project_id, user, {"owner"}, write=True)
    await _lock_project(session, project_id)
    baseline = await _baseline_for_update(session, project_id, baseline_id)
    if baseline is None:
        raise HTTPException(status_code=404, detail="schedule baseline not found")
    if baseline.version != expected_version:
        raise HTTPException(status_code=409, detail="schedule baseline version conflict")
    await session.delete(baseline)
    await session.commit()
    return Response(status_code=204)


@router.put(
    "/projects/{project_id}/schedule-baseline",
    response_model=ProjectScheduleBaselineSummary,
    responses={403: {}, 409: {}},
)
async def capture_project_schedule_baseline(
    project_id: uuid.UUID,
    body: ProjectScheduleBaselineMutation,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectScheduleBaselineSummary:
    await require_role(session, project_id, user, {"owner"}, write=True)
    await _lock_project(session, project_id)
    baseline = await _baseline_for_update(session, project_id)
    if baseline is None:
        if body.expected_version is not None:
            raise HTTPException(status_code=409, detail="schedule baseline does not exist")
        baseline = ProjectScheduleBaseline(
            project_id=project_id,
            name="기준선 1",
            captured_by_user_id=user.id,
        )
        session.add(baseline)
        await session.flush()
    else:
        if body.expected_version != baseline.version:
            raise HTTPException(status_code=409, detail="schedule baseline version conflict")
        await session.execute(
            delete(ProjectScheduleBaselineItem).where(
                ProjectScheduleBaselineItem.baseline_id == baseline.id
            )
        )
        baseline.version += 1
        baseline.captured_by_user_id = user.id
        baseline.captured_at = datetime.now(UTC)
    await _capture_items(session, project_id, baseline)
    await session.commit()
    await session.refresh(baseline)
    return await _summary(session, project_id, baseline)


@router.delete(
    "/projects/{project_id}/schedule-baseline",
    status_code=204,
    responses={403: {}, 404: {}, 409: {}},
)
async def delete_project_schedule_baseline(
    project_id: uuid.UUID,
    expected_version: int = Query(ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await require_role(session, project_id, user, {"owner"}, write=True)
    await _lock_project(session, project_id)
    baseline = await _baseline_for_update(session, project_id)
    if baseline is None:
        raise HTTPException(status_code=404, detail="schedule baseline not found")
    if baseline.version != expected_version:
        raise HTTPException(status_code=409, detail="schedule baseline version conflict")
    await session.delete(baseline)
    await session.commit()
    return Response(status_code=204)
