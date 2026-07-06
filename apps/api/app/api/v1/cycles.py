import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member, require_role
from app.db.session import get_session
from app.models.cycle import Cycle
from app.models.user import User
from app.models.work_package import WP_CLOSED_STATUSES, WorkPackage
from app.schemas.cycle import CycleCreate, CycleList, CycleRead, CycleUpdate

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
