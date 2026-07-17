"""Project-scoped work-item type vocabulary and lifecycle."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member, require_role
from app.db.session import get_session
from app.models.project_type import (
    BUILTIN_TYPE_KEYS,
    DEFAULT_TYPES,
    MAX_ACTIVE_PROJECT_TYPES,
    MAX_PROJECT_TYPES,
    ProjectType,
)
from app.models.user import User
from app.schemas.project_type import (
    ProjectTypeCreate,
    ProjectTypeList,
    ProjectTypeRead,
    ProjectTypeReorder,
    ProjectTypeUpdate,
)

router = APIRouter()

# Advisory lock class for enablement changes: the "keep at least one active
# type" invariant must survive two concurrent deactivations (house pattern).
TYPE_LOCK_CLASSID = 427003


async def _lock_types(session: AsyncSession, project_id: uuid.UUID) -> None:
    await session.execute(text("SET LOCAL lock_timeout = '5s'"))
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:classid, hashtext(:pid))").bindparams(
            classid=TYPE_LOCK_CLASSID, pid=str(project_id)
        )
    )


async def _configured_type(
    session: AsyncSession, project_id: uuid.UUID, type_key: str
) -> tuple[bool | None, int]:
    row = (
        await session.execute(
            select(ProjectType.is_active).where(
                ProjectType.project_id == project_id, ProjectType.key == type_key
            )
        )
    ).scalar_one_or_none()
    total = (
        await session.execute(
            select(func.count())
            .select_from(ProjectType)
            .where(ProjectType.project_id == project_id)
        )
    ).scalar_one()
    return row, total


async def require_type_known(session: AsyncSession, project_id: uuid.UUID, type_key: str) -> None:
    """Reject unknown project keys while preserving the built-in rolling fallback."""
    row, total = await _configured_type(session, project_id, type_key)
    if row is None and not (total == 0 and type_key in BUILTIN_TYPE_KEYS):
        raise HTTPException(status_code=422, detail=f"unknown type '{type_key}' in this project")


async def require_type_enabled(session: AsyncSession, project_id: uuid.UUID, type_key: str) -> None:
    """Require a known active type for every new use of the vocabulary."""
    row, total = await _configured_type(session, project_id, type_key)
    if row is None:
        if total == 0 and type_key in BUILTIN_TYPE_KEYS:
            return
        raise HTTPException(status_code=422, detail=f"unknown type '{type_key}' in this project")
    if row is False:
        raise HTTPException(
            status_code=422, detail=f"type '{type_key}' is disabled in this project"
        )


def _read(row: ProjectType) -> ProjectTypeRead:
    return ProjectTypeRead.model_validate(row)


async def _ensure_defaults(session: AsyncSession, project_id: uuid.UUID) -> list[ProjectType]:
    rows = (
        (
            await session.execute(
                select(ProjectType)
                .where(ProjectType.project_id == project_id)
                .order_by(ProjectType.position.asc(), ProjectType.key.asc())
            )
        )
        .scalars()
        .all()
    )
    if rows:
        return list(rows)
    rows = [
        ProjectType(project_id=project_id, key=key, name=name, position=position)
        for key, name, position in DEFAULT_TYPES
    ]
    session.add_all(rows)
    await session.flush()
    return rows


@router.get("/projects/{project_id}/types", response_model=ProjectTypeList)
async def list_project_types(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectTypeList:
    await require_member(session, project_id, user)
    rows = (
        (
            await session.execute(
                select(ProjectType)
                .where(ProjectType.project_id == project_id)
                .order_by(ProjectType.position.asc(), ProjectType.key.asc())
            )
        )
        .scalars()
        .all()
    )
    return ProjectTypeList(items=[_read(r) for r in rows], total=len(rows))


@router.post("/projects/{project_id}/types", response_model=ProjectTypeRead, status_code=201)
async def create_project_type(
    project_id: uuid.UUID,
    body: ProjectTypeCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectTypeRead:
    await require_role(session, project_id, user, {"owner"}, write=True)
    await _lock_types(session, project_id)
    rows = await _ensure_defaults(session, project_id)
    if len(rows) >= MAX_PROJECT_TYPES:
        raise HTTPException(
            status_code=409, detail=f"work-item type limit ({MAX_PROJECT_TYPES}) reached"
        )
    if sum(row.is_active for row in rows) >= MAX_ACTIVE_PROJECT_TYPES:
        raise HTTPException(
            status_code=409,
            detail=f"active work-item type limit ({MAX_ACTIVE_PROJECT_TYPES}) reached",
        )
    if any(row.name.casefold() == body.name.casefold() for row in rows):
        raise HTTPException(status_code=409, detail="a type with that name already exists")
    row = ProjectType(
        project_id=project_id,
        key=f"custom_{uuid.uuid4().hex[:12]}",
        name=body.name,
        position=max(item.position for item in rows) + 1,
        is_active=True,
    )
    session.add(row)
    await session.flush()
    await session.commit()
    return _read(row)


@router.patch("/projects/{project_id}/types/{type_id}", response_model=ProjectTypeRead)
async def update_project_type(
    project_id: uuid.UUID,
    type_id: uuid.UUID,
    body: ProjectTypeUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectTypeRead:
    await require_role(session, project_id, user, {"owner"}, write=True)
    row = (
        await session.execute(select(ProjectType).where(ProjectType.id == type_id))
    ).scalar_one_or_none()
    if row is None or row.project_id != project_id:
        raise HTTPException(status_code=404, detail="not found")
    fields = body.model_dump(exclude_unset=True)
    for key in ("name", "is_active"):
        if key in fields and fields[key] is None:
            raise HTTPException(status_code=422, detail=f"{key} cannot be null")

    if "name" in fields and fields["name"] != row.name:
        await _lock_types(session, project_id)
        duplicate = (
            await session.execute(
                select(ProjectType.id).where(
                    ProjectType.project_id == project_id,
                    func.lower(ProjectType.name) == fields["name"].lower(),
                    ProjectType.id != type_id,
                )
            )
        ).first()
        if duplicate is not None:
            raise HTTPException(status_code=409, detail="a type with that name already exists")

    if fields.get("is_active") is False and row.is_active:
        # Serialize the invariant check per project: two concurrent
        # deactivations must not race past each other to zero active types.
        await _lock_types(session, project_id)
        active_others = (
            await session.execute(
                select(ProjectType.id).where(
                    ProjectType.project_id == project_id,
                    ProjectType.is_active.is_(True),
                    ProjectType.id != type_id,
                )
            )
        ).first()
        if active_others is None:
            raise HTTPException(
                status_code=409, detail="at least one work-item type must stay active"
            )
    if fields.get("is_active") is True and not row.is_active:
        await _lock_types(session, project_id)
        active_count = (
            await session.execute(
                select(func.count()).where(
                    ProjectType.project_id == project_id,
                    ProjectType.is_active.is_(True),
                )
            )
        ).scalar_one()
        if active_count >= MAX_ACTIVE_PROJECT_TYPES:
            raise HTTPException(
                status_code=409,
                detail=f"active work-item type limit ({MAX_ACTIVE_PROJECT_TYPES}) reached",
            )
    for key, value in fields.items():
        setattr(row, key, value)
    await session.commit()
    return _read(row)


@router.put("/projects/{project_id}/types/order", response_model=ProjectTypeList)
async def reorder_project_types(
    project_id: uuid.UUID,
    body: ProjectTypeReorder,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectTypeList:
    """Owner-only atomic reorder — same contract as the status reorder."""
    await require_role(session, project_id, user, {"owner"}, write=True)
    await _lock_types(session, project_id)
    rows = (
        (await session.execute(select(ProjectType).where(ProjectType.project_id == project_id)))
        .scalars()
        .all()
    )
    by_id = {r.id: r for r in rows}
    if set(body.ordered_ids) != set(by_id):
        raise HTTPException(
            status_code=422, detail="ordered_ids must list exactly this project's types"
        )
    for position, tid in enumerate(body.ordered_ids):
        by_id[tid].position = position
    await session.commit()
    ordered = sorted(rows, key=lambda r: r.position)
    return ProjectTypeList(items=[_read(r) for r in ordered], total=len(ordered))
