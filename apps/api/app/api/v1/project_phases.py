import uuid
from collections.abc import Iterable
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member, require_role
from app.db.session import get_session
from app.models.project import Project
from app.models.project_phase import ProjectPhase
from app.models.user import User
from app.models.workspace_profile import WorkspaceProfile
from app.schemas.project_phase import (
    ProjectPhaseGateRead,
    ProjectPhaseList,
    ProjectPhasePatch,
    ProjectPhaseRead,
)
from app.schemas.workspace_profile import WorkspaceProjectPhaseDefinitionsUpdate

router = APIRouter()


def _definitions(row: WorkspaceProfile) -> list[dict[str, str]]:
    try:
        definitions = WorkspaceProjectPhaseDefinitionsUpdate(
            items=row.project_phase_definitions
        ).items
    except ValueError as error:
        raise HTTPException(
            status_code=500,
            detail="workspace project phase definitions are invalid",
        ) from error
    return [definition.model_dump() for definition in definitions]


def _read(
    definition: dict[str, str],
    row: ProjectPhase | None,
    position: int,
) -> ProjectPhaseRead:
    key = definition["key"]
    name = definition["name"]
    color = definition["color"]
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
            name=f"{name} 시작 게이트",
            active=start_gate_active,
            date=start_date if active and start_gate_active else None,
        ),
        finish_gate=ProjectPhaseGateRead(
            kind="finish",
            name=f"{name} 완료 게이트",
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


def _working_day_count(start: date, end: date, weekdays: set[int], holidays: set[date]) -> int:
    if end < start:
        return 0
    days = (end - start).days + 1
    weeks, remainder = divmod(days, 7)
    count = weeks * len(weekdays)
    count += sum((start.weekday() + offset) % 7 in weekdays for offset in range(remainder))
    count -= sum(start <= holiday <= end and holiday.weekday() in weekdays for holiday in holidays)
    return count


def _add_working_days(start: date, days: int, weekdays: set[int], holidays: set[date]) -> date:
    if days <= 0:
        return start
    low = 1
    high = (date.max - start).days
    if _working_day_count(start + timedelta(days=1), date.max, weekdays, holidays) < days:
        raise OverflowError
    while low < high:
        middle = (low + high) // 2
        candidate = start + timedelta(days=middle)
        if _working_day_count(start + timedelta(days=1), candidate, weekdays, holidays) >= days:
            high = middle
        else:
            low = middle + 1
    return start + timedelta(days=low)


def _next_working_day(value: date, weekdays: set[int], holidays: set[date]) -> date:
    return _add_working_days(value, 1, weekdays, holidays)


def _previous_active_end(
    phase_key: str,
    phase_keys: list[str],
    proposed_by_key: dict[str, ProjectPhaseRead],
) -> date | None:
    predecessor_end = None
    for key in phase_keys:
        if key == phase_key:
            break
        phase = proposed_by_key[key]
        if phase.active and phase.end_date is not None:
            predecessor_end = phase.end_date
    return predecessor_end


def _reschedule_successors(
    phase_key: str,
    phase_keys: list[str],
    predecessor_end: date,
    proposed_by_key: dict[str, ProjectPhaseRead],
    persisted_by_key: dict[str, ProjectPhase],
    weekdays: set[int],
    holidays: set[date],
    *,
    preserve_partial: bool = False,
) -> set[str]:
    scheduled_keys: set[str] = set()
    after_predecessor = False
    for key in phase_keys:
        if key == phase_key:
            after_predecessor = True
            continue
        if not after_predecessor:
            continue
        successor = proposed_by_key[key]
        if not successor.active:
            continue
        if successor.start_date and successor.end_date:
            start_date = _next_working_day(predecessor_end, weekdays, holidays)
            duration = _working_day_count(
                successor.start_date,
                successor.end_date,
                weekdays,
                holidays,
            )
            if duration == 0 and preserve_partial:
                break
            duration = max(duration, 1)
            end_date = _add_working_days(start_date, duration - 1, weekdays, holidays)
            successor = successor.model_copy(
                update={"start_date": start_date, "end_date": end_date}
            )
            proposed_by_key[key] = successor
            persisted = persisted_by_key.get(key)
            persisted_start = None if persisted is None else persisted.start_date
            persisted_end = None if persisted is None else persisted.end_date
            if successor.start_date != persisted_start or successor.end_date != persisted_end:
                scheduled_keys.add(key)
            predecessor_end = end_date
            continue
        if successor.start_date:
            if preserve_partial:
                break
            successor = successor.model_copy(
                update={"start_date": _next_working_day(predecessor_end, weekdays, holidays)}
            )
            proposed_by_key[key] = successor
            persisted_start = (
                None if persisted_by_key.get(key) is None else persisted_by_key[key].start_date
            )
            if successor.start_date != persisted_start:
                scheduled_keys.add(key)
            break
        break
    return scheduled_keys


@router.get("/projects/{project_id}/phases", response_model=ProjectPhaseList)
async def list_project_phases(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectPhaseList:
    await require_member(session, project_id, user)
    workspace = await session.get(WorkspaceProfile, 1)
    if workspace is None:
        raise HTTPException(status_code=500, detail="workspace profile is missing")
    definitions = _definitions(workspace)
    rows = (
        (await session.execute(select(ProjectPhase).where(ProjectPhase.project_id == project_id)))
        .scalars()
        .all()
    )
    by_key = {row.key: row for row in rows}
    items = [
        _read(definition, by_key.get(definition["key"]), position)
        for position, definition in enumerate(definitions)
    ]
    return ProjectPhaseList(items=items, total=len(items))


@router.patch("/projects/{project_id}/phases/{phase_key}", response_model=ProjectPhaseRead)
async def patch_project_phase(
    project_id: uuid.UUID,
    phase_key: str,
    body: ProjectPhasePatch,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectPhaseRead:
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
    workspace = (
        await session.execute(
            select(WorkspaceProfile).where(WorkspaceProfile.id == 1).with_for_update()
        )
    ).scalar_one_or_none()
    if workspace is None:
        raise HTTPException(status_code=500, detail="workspace profile is missing")
    definitions = _definitions(workspace)
    definitions_by_key = {definition["key"]: definition for definition in definitions}
    phase_keys = [definition["key"] for definition in definitions]
    if phase_key not in definitions_by_key:
        raise HTTPException(status_code=404, detail="not found")
    position_by_key = {key: position for position, key in enumerate(phase_keys)}
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
    before = _read(definitions_by_key[phase_key], current, position_by_key[phase_key])
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
    proposed_by_key = {
        key: candidate
        if key == phase_key
        else _read(definitions_by_key[key], by_key.get(key), position_by_key[key])
        for key in phase_keys
    }
    scheduled_keys: set[str] = set()
    finish_changed = (
        "end_date" in provided
        and candidate.active
        and candidate.end_date is not None
        and candidate.end_date != before.end_date
    )
    activated = "active" in provided and candidate.active and not before.active
    activation_predecessor_end = _previous_active_end(
        phase_key,
        phase_keys,
        proposed_by_key,
    )
    activation_reschedules = bool(
        activated
        and before.start_date
        and before.end_date
        and activation_predecessor_end is not None
        and not ({"start_date", "end_date"} & provided)
    )
    try:
        if finish_changed or activation_reschedules:
            working_weekdays = set(workspace.working_weekdays)
            holidays = {date.fromisoformat(value) for value in workspace.holidays}
            if activation_reschedules:
                assert activation_predecessor_end is not None
                assert candidate.start_date is not None
                assert candidate.end_date is not None
                start_date = _next_working_day(
                    activation_predecessor_end,
                    working_weekdays,
                    holidays,
                )
                duration = _working_day_count(
                    candidate.start_date,
                    candidate.end_date,
                    working_weekdays,
                    holidays,
                )
                if duration > 0:
                    end_date = _add_working_days(
                        start_date,
                        duration - 1,
                        working_weekdays,
                        holidays,
                    )
                    candidate = candidate.model_copy(
                        update={"start_date": start_date, "end_date": end_date}
                    )
                    proposed_by_key[phase_key] = candidate
                    scheduled_keys.update(
                        _reschedule_successors(
                            phase_key,
                            phase_keys,
                            end_date,
                            proposed_by_key,
                            by_key,
                            working_weekdays,
                            holidays,
                            preserve_partial=True,
                        )
                    )
            else:
                scheduled_keys.update(
                    _reschedule_successors(
                        phase_key,
                        phase_keys,
                        candidate.end_date,
                        proposed_by_key,
                        by_key,
                        working_weekdays,
                        holidays,
                    )
                )
    except OverflowError as error:
        raise HTTPException(
            status_code=422,
            detail="rescheduled phase dates exceed the supported range",
        ) from error
    proposed = [proposed_by_key[key] for key in phase_keys]
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
    for key in scheduled_keys:
        successor = by_key[key]
        scheduled = proposed_by_key[key]
        successor.start_date = scheduled.start_date
        successor.end_date = scheduled.end_date
        successor.version += 1
    await session.commit()
    return _read(definitions_by_key[phase_key], current, position_by_key[phase_key])
