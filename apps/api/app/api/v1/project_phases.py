import uuid
from collections.abc import Iterable

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member, require_role
from app.db.session import get_session
from app.models.project import Project
from app.models.project_phase import (
    PROJECT_PHASE_BY_KEY,
    PROJECT_PHASE_GATE_NAMES,
    PROJECT_PHASES,
    ProjectPhase,
)
from app.models.user import User
from app.schemas.project_phase import (
    ProjectPhaseGateRead,
    ProjectPhaseList,
    ProjectPhasePatch,
    ProjectPhaseRead,
)

router = APIRouter()


def _read(key: str, row: ProjectPhase | None) -> ProjectPhaseRead:
    _, name, color, position = PROJECT_PHASE_BY_KEY[key]
    start_gate_name, finish_gate_name = PROJECT_PHASE_GATE_NAMES[key]
    active = False if row is None else row.is_active
    start_gate_active = False if row is None else row.start_gate_active
    finish_gate_active = False if row is None else row.finish_gate_active
    start_date = None if row is None else row.start_date
    end_date = None if row is None else row.end_date
    return ProjectPhaseRead(
        key=key,
        name=name,
        color=color,
        position=position,
        active=active,
        start_date=start_date,
        end_date=end_date,
        start_gate=ProjectPhaseGateRead(
            kind="start",
            name=start_gate_name,
            active=start_gate_active,
            date=start_date if active and start_gate_active else None,
        ),
        finish_gate=ProjectPhaseGateRead(
            kind="finish",
            name=finish_gate_name,
            active=finish_gate_active,
            date=end_date if active and finish_gate_active else None,
        ),
        version=0 if row is None else row.version,
    )


def _current_value(field: str, before: ProjectPhaseRead, current: ProjectPhase | None) -> object:
    if field in {"active", "start_date", "end_date"}:
        return getattr(before, field)
    return False if current is None else getattr(current, field)


def _validate_ranges(rows: Iterable[ProjectPhaseRead]) -> None:
    complete = [row for row in rows if row.active and row.start_date and row.end_date]
    for previous, current in zip(complete, complete[1:], strict=False):
        if previous.end_date >= current.start_date:
            raise HTTPException(
                status_code=422,
                detail="active phase date ranges must follow phase order and not overlap",
            )


@router.get("/projects/{project_id}/phases", response_model=ProjectPhaseList)
async def list_project_phases(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectPhaseList:
    await require_member(session, project_id, user)
    rows = (
        (await session.execute(select(ProjectPhase).where(ProjectPhase.project_id == project_id)))
        .scalars()
        .all()
    )
    by_key = {row.key: row for row in rows}
    items = [_read(key, by_key.get(key)) for key, _, _, _ in PROJECT_PHASES]
    return ProjectPhaseList(items=items, total=len(items))


@router.patch("/projects/{project_id}/phases/{phase_key}", response_model=ProjectPhaseRead)
async def patch_project_phase(
    project_id: uuid.UUID,
    phase_key: str,
    body: ProjectPhasePatch,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectPhaseRead:
    if phase_key not in PROJECT_PHASE_BY_KEY:
        raise HTTPException(status_code=404, detail="not found")
    await require_role(session, project_id, user, {"owner"}, write=True)

    project = (
        await session.execute(select(Project).where(Project.id == project_id).with_for_update())
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="not found")
    # The role guard checks archive state before this row lock. Recheck the
    # locked row so an archive committed in between cannot admit a late write.
    if project.archived_at is not None:
        raise HTTPException(status_code=409, detail="project is archived")
    rows = (
        (await session.execute(select(ProjectPhase).where(ProjectPhase.project_id == project_id)))
        .scalars()
        .all()
    )
    by_key = {row.key: row for row in rows}
    current = by_key.get(phase_key)
    current_version = 0 if current is None else current.version
    if current_version != body.version:
        raise HTTPException(status_code=409, detail="phase version conflict")

    provided = body.model_fields_set - {"version"}
    for field in {"active", "start_gate_active", "finish_gate_active"} & provided:
        if getattr(body, field) is None:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null")
    before = _read(phase_key, current)
    candidate_values = {
        "active": before.active,
        "start_date": before.start_date,
        "end_date": before.end_date,
        "start_gate_active": False if current is None else current.start_gate_active,
        "finish_gate_active": False if current is None else current.finish_gate_active,
    }
    candidate_values.update({field: getattr(body, field) for field in provided})
    candidate = before.model_copy(
        update={field: candidate_values[field] for field in {"active", "start_date", "end_date"}}
    )
    if candidate.start_date and candidate.end_date and candidate.start_date > candidate.end_date:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date")
    proposed = [
        candidate if key == phase_key else _read(key, by_key.get(key))
        for key, _, _, _ in PROJECT_PHASES
    ]
    _validate_ranges(proposed)

    changed = any(
        candidate_values[field] != _current_value(field, before, current) for field in provided
    )
    if not changed:
        return before

    if current is None:
        current = ProjectPhase(project_id=project_id, key=phase_key, version=0)
        session.add(current)
    current.is_active = candidate.active
    current.start_gate_active = candidate_values["start_gate_active"]
    current.finish_gate_active = candidate_values["finish_gate_active"]
    current.start_date = candidate.start_date
    current.end_date = candidate.end_date
    current.version += 1
    await session.commit()
    return _read(phase_key, current)
