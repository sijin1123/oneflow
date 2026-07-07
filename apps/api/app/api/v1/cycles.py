import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member, require_role
from app.db.session import get_session
from app.models.activity import Activity
from app.models.cycle import Cycle
from app.models.user import User
from app.models.work_package import WP_CLOSED_STATUSES, WorkPackage
from app.schemas.cycle import (
    BurndownDay,
    BurndownRead,
    CycleCreate,
    CycleList,
    CycleRead,
    CycleUpdate,
)

router = APIRouter()

# Permission split (expansion PLAN §4 PR-C): managing cycles is an owner action
# (same as milestones/settings); ASSIGNING a work package to a cycle is a plain
# member action via the work-package PATCH — see work_packages.py.


def cycle_status(c: Cycle, today: date) -> str:
    if c.start_date > today:
        return "upcoming"
    if c.end_date < today:
        return "completed"
    return "active"


def _read(c: Cycle, today: date, total: int, done: int) -> CycleRead:
    return CycleRead(
        id=c.id,
        project_id=c.project_id,
        name=c.name,
        description=c.description,
        start_date=c.start_date,
        end_date=c.end_date,
        status=cycle_status(c, today),
        work_package_count=total,
        done_work_package_count=done,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


async def _counts(session: AsyncSession, project_id: uuid.UUID) -> dict[uuid.UUID, tuple[int, int]]:
    """Per-cycle (total, done) work-package counts in ONE aggregate query."""
    done = func.count().filter(WorkPackage.status.in_(WP_CLOSED_STATUSES))
    rows = (
        await session.execute(
            select(WorkPackage.cycle_id, func.count(), done)
            .where(WorkPackage.project_id == project_id, WorkPackage.cycle_id.is_not(None))
            .group_by(WorkPackage.cycle_id)
        )
    ).all()
    return {cycle_id: (total, done_n) for (cycle_id, total, done_n) in rows}


async def _get_scoped(session: AsyncSession, project_id: uuid.UUID, cycle_id: uuid.UUID) -> Cycle:
    c = (await session.execute(select(Cycle).where(Cycle.id == cycle_id))).scalar_one_or_none()
    if c is None or c.project_id != project_id:
        raise HTTPException(status_code=404, detail="not found")
    return c


@router.get("/projects/{project_id}/cycles", response_model=CycleList)
async def list_cycles(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CycleList:
    await require_member(session, project_id, user)
    rows = (
        (
            await session.execute(
                select(Cycle)
                .where(Cycle.project_id == project_id)
                .order_by(Cycle.start_date.desc(), Cycle.name.asc())
            )
        )
        .scalars()
        .all()
    )
    counts = await _counts(session, project_id)
    today = date.today()
    items = [_read(c, today, *counts.get(c.id, (0, 0))) for c in rows]
    return CycleList(items=items, total=len(items))


@router.post("/projects/{project_id}/cycles", response_model=CycleRead, status_code=201)
async def create_cycle(
    project_id: uuid.UUID,
    body: CycleCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CycleRead:
    await require_role(session, project_id, user, {"owner"}, write=True)
    c = Cycle(
        project_id=project_id,
        name=body.name,
        description=body.description,
        start_date=body.start_date,
        end_date=body.end_date,
    )
    session.add(c)
    await session.commit()
    return _read(c, date.today(), 0, 0)


@router.patch("/projects/{project_id}/cycles/{cycle_id}", response_model=CycleRead)
async def update_cycle(
    project_id: uuid.UUID,
    cycle_id: uuid.UUID,
    body: CycleUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CycleRead:
    await require_role(session, project_id, user, {"owner"}, write=True)
    c = await _get_scoped(session, project_id, cycle_id)
    fields = body.model_dump(exclude_unset=True)
    for key in ("name", "start_date", "end_date"):
        if key in fields and fields[key] is None:
            raise HTTPException(status_code=422, detail=f"{key} cannot be null")
    # Cross-field check against the MERGED range so a partial update can't
    # invert it (mirrors the DB CHECK, but as a clean 422).
    start = fields.get("start_date", c.start_date)
    end = fields.get("end_date", c.end_date)
    if start > end:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date")
    for key, value in fields.items():
        setattr(c, key, value)
    await session.commit()
    await session.refresh(c)  # onupdate updated_at is server-computed
    counts = await _counts(session, project_id)
    return _read(c, date.today(), *counts.get(c.id, (0, 0)))


@router.delete("/projects/{project_id}/cycles/{cycle_id}", status_code=204)
async def delete_cycle(
    project_id: uuid.UUID,
    cycle_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await require_role(session, project_id, user, {"owner"}, write=True)
    c = await _get_scoped(session, project_id, cycle_id)
    # The UI shows work_package_count in its confirm dialog; the DB clears only
    # work_packages.cycle_id via the column-list SET NULL composite FK.
    await session.delete(c)
    await session.commit()
    return Response(status_code=204)


class RolloverRequest(BaseModel):
    target_cycle_id: uuid.UUID


class RolloverResult(BaseModel):
    moved: int


@router.post("/projects/{project_id}/cycles/{cycle_id}/rollover", response_model=RolloverResult)
async def rollover_cycle(
    project_id: uuid.UUID,
    cycle_id: uuid.UUID,
    body: RolloverRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> RolloverResult:
    """Move the source cycle's OPEN work packages to the target cycle
    (PLAN P6-2). One UPDATE statement = statement-time snapshot (plain PG
    row-level semantics — no extra locking); concurrently closed/moved rows are
    judged as of execution. NOT destructive: it only reassigns cycle_id, so a
    reverse rollover restores the previous grouping. Source/target lifecycle
    states are deliberately unconstrained (the operator picks the moment); the
    UI merely SUGGESTS completed sources."""
    await require_role(session, project_id, user, {"owner"}, write=True)
    await _get_scoped(session, project_id, cycle_id)
    if body.target_cycle_id == cycle_id:
        raise HTTPException(status_code=422, detail="target must differ from the source cycle")
    # Target is request DATA (not a path resource): a cross-project/unknown id is
    # a validation error, same contract as WP cycle assignment (422, not 404).
    target = (
        await session.execute(select(Cycle).where(Cycle.id == body.target_cycle_id))
    ).scalar_one_or_none()
    if target is None or target.project_id != project_id:
        raise HTTPException(status_code=422, detail="target cycle must belong to the same project")

    result = await session.execute(
        sa_update(WorkPackage)
        .where(
            WorkPackage.project_id == project_id,
            WorkPackage.cycle_id == cycle_id,
            WorkPackage.status.not_in(WP_CLOSED_STATUSES),
        )
        .values(cycle_id=body.target_cycle_id)
    )
    await session.commit()
    return RolloverResult(moved=result.rowcount or 0)


@router.get("/projects/{project_id}/cycles/{cycle_id}/burndown", response_model=BurndownRead)
async def cycle_burndown(
    project_id: uuid.UUID,
    cycle_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> BurndownRead:
    """Current-scope burndown-lite (Pass 21, v21.1) — derived from the status
    activity history, no snapshots. Per WP the timeline is exact: before the
    first status activity the status was that activity's old_value; after each
    activity it is its new_value; with no activities it never changed. A day's
    `remaining` counts scoped WPs created by that day whose end-of-day status
    is outside the FIXED closed vocabulary (WP_CLOSED_STATUSES — label/enable
    config never rewrites history, R1-④). All dates are UTC date-only; the
    series stops at min(end_date, today) — the future is not fabricated.
    Member read; archived projects stay readable (read-open); a foreign or
    missing cycle is 404 (existence hiding). The two reads are sequential —
    a mid-flight status change converges to the current state next fetch
    (read-only visualization, R1-②)."""
    await require_member(session, project_id, user)
    cycle = await _get_scoped(session, project_id, cycle_id)

    wps = (
        (
            await session.execute(
                select(WorkPackage).where(
                    WorkPackage.project_id == project_id, WorkPackage.cycle_id == cycle_id
                )
            )
        )
        .scalars()
        .all()
    )
    # UTC date-only per the v21.1 contract — date.today() is the SERVER's
    # local zone and shifts the series at midnight boundaries (found when the
    # local date rolled past UTC).
    today = datetime.now(UTC).date()
    end = min(cycle.end_date, today)
    if not wps or end < cycle.start_date:
        return BurndownRead(scope="current_assignment", total_scope=len(wps), days=[])

    # Status activities for the scoped WPs only (ix_activities_wp_created).
    acts = (
        await session.execute(
            select(
                Activity.work_package_id,
                Activity.old_value,
                Activity.new_value,
                Activity.created_at,
            )
            .where(
                Activity.work_package_id.in_([w.id for w in wps]),
                Activity.field == "status",
            )
            .order_by(Activity.created_at.asc(), Activity.id.asc())
        )
    ).all()
    by_wp: dict[uuid.UUID, list] = {}
    for wp_id, old, new, at in acts:
        by_wp.setdefault(wp_id, []).append((at.date(), old, new))

    closed = set(WP_CLOSED_STATUSES)
    days: list[BurndownDay] = []
    d = cycle.start_date
    while d <= end:
        remaining = 0
        for wp in wps:
            if wp.created_at.date() > d:
                continue  # not yet created on day d
            history = by_wp.get(wp.id)
            if not history:
                status_on_d = wp.status  # never changed — exact
            elif history[0][0] > d:
                status_on_d = history[0][1]  # before the first change: its old_value
            else:
                status_on_d = next(h[2] for h in reversed(history) if h[0] <= d)
            if status_on_d not in closed:
                remaining += 1
        days.append(BurndownDay(date=d, remaining=remaining))
        d = date.fromordinal(d.toordinal() + 1)

    return BurndownRead(scope="current_assignment", total_scope=len(wps), days=days)
