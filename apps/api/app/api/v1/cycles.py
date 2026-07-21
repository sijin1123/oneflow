import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member, require_permission
from app.core.config import Settings, get_settings
from app.core.dates import utc_today
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
from app.services.activity import activity_actor_fields, capture_actor_identity
from app.services.cycle_scope import build_cycle_scope_analytics, record_cycle_scope_change
from app.services.webhooks import enqueue_work_package_event

router = APIRouter()

# Permission split (expansion PLAN §4 PR-C): managing cycles requires cycle.manage;
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
    today = utc_today()
    items = [_read(c, today, *counts.get(c.id, (0, 0))) for c in rows]
    return CycleList(items=items, total=len(items))


@router.post("/projects/{project_id}/cycles", response_model=CycleRead, status_code=201)
async def create_cycle(
    project_id: uuid.UUID,
    body: CycleCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CycleRead:
    await require_permission(session, project_id, user, "cycle.manage", write=True)
    c = Cycle(
        project_id=project_id,
        name=body.name,
        description=body.description,
        start_date=body.start_date,
        end_date=body.end_date,
    )
    session.add(c)
    await session.commit()
    return _read(c, utc_today(), 0, 0)


@router.patch("/projects/{project_id}/cycles/{cycle_id}", response_model=CycleRead)
async def update_cycle(
    project_id: uuid.UUID,
    cycle_id: uuid.UUID,
    body: CycleUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CycleRead:
    await require_permission(session, project_id, user, "cycle.manage", write=True)
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
    return _read(c, utc_today(), *counts.get(c.id, (0, 0)))


@router.delete("/projects/{project_id}/cycles/{cycle_id}", status_code=204)
async def delete_cycle(
    project_id: uuid.UUID,
    cycle_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await require_permission(session, project_id, user, "cycle.manage", write=True)
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
    settings: Settings = Depends(get_settings),
) -> RolloverResult:
    """Move the source cycle's OPEN work packages to the target cycle
    (PLAN P6-2). One UPDATE statement = statement-time snapshot (plain PG
    row-level semantics — no extra locking); concurrently closed/moved rows are
    judged as of execution. NOT destructive: it only reassigns cycle_id, so a
    reverse rollover restores the previous grouping. Source/target lifecycle
    states are deliberately unconstrained (the operator picks the moment); the
    UI merely SUGGESTS completed sources."""
    await require_permission(session, project_id, user, "cycle.manage", write=True)
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

    src = (await session.execute(select(Cycle).where(Cycle.id == cycle_id))).scalar_one()
    moved_ids = (
        (
            await session.execute(
                sa_update(WorkPackage)
                .where(
                    WorkPackage.project_id == project_id,
                    WorkPackage.cycle_id == cycle_id,
                    WorkPackage.status.not_in(WP_CLOSED_STATUSES),
                )
                .values(
                    cycle_id=body.target_cycle_id,
                    version=WorkPackage.version + 1,
                    updated_at=func.now(),
                )
                .returning(WorkPackage)
            )
        )
        .scalars()
        .all()
    )
    # Assignment history (Pass 71, v71.1 R1-④): one activity per moved WP with
    # NAME snapshots — a later rename/delete never distorts this record.
    actor_snapshot = await capture_actor_identity(session, user.id)
    for wp in moved_ids:
        record_cycle_scope_change(
            session,
            project_id=project_id,
            work_package_id=wp.id,
            actor_id=user.id,
            old_cycle_id=cycle_id,
            new_cycle_id=body.target_cycle_id,
        )
        session.add(
            Activity(
                work_package_id=wp.id,
                actor_id=user.id,
                action="field_changed",
                field="cycle_id",
                old_value=src.name,
                new_value=target.name,
                **activity_actor_fields(actor_snapshot),
            )
        )
        await enqueue_work_package_event(
            session, settings, "work_package.updated", wp, ["cycle_id"]
        )
    await session.commit()
    return RolloverResult(moved=len(moved_ids))


@router.get("/projects/{project_id}/cycles/{cycle_id}/burndown", response_model=BurndownRead)
async def cycle_burndown(
    project_id: uuid.UUID,
    cycle_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> BurndownRead:
    """Stable-ID scope, remaining and delivered series.

    New cycles are exact from creation. Cycles that predate migration expose
    an explicit coverage boundary; cycles completed before that boundary keep
    the old current-assignment visualization under a truthful legacy mode.
    Dates are UTC date-only and stop at min(end_date, today). Member read;
    archived projects stay readable and foreign cycles remain hidden.
    """
    await require_member(session, project_id, user)
    cycle = await _get_scoped(session, project_id, cycle_id)
    analytics = await build_cycle_scope_analytics(session, cycle, utc_today())
    return BurndownRead(
        scope=analytics.scope,
        tracking_started_at=analytics.tracking_started_at,
        coverage_start=analytics.coverage_start,
        coverage_complete=analytics.coverage_complete,
        total_scope=analytics.total_scope,
        current_scope=analytics.current_scope,
        added_count=analytics.added_count,
        removed_count=analytics.removed_count,
        delivered=analytics.delivered,
        days=[
            BurndownDay(
                date=point.date,
                scope=point.scope,
                remaining=point.remaining,
                delivered=point.delivered,
            )
            for point in analytics.days
        ],
    )
