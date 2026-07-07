"""Per-project work-item type configuration (expansion Pass 7 PR-R).

Same presentation/config layer as project_statuses — the KEYS stay the fixed
WP_TYPES set — plus enablement: a disabled type blocks NEW usage (create, or a
PATCH that actually changes the type) while existing work packages keep their
type untouched.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member, require_role
from app.db.session import get_session
from app.models.project_type import ProjectType
from app.models.user import User
from app.schemas.project_type import (
    ProjectTypeList,
    ProjectTypeRead,
    ProjectTypeReorder,
    ProjectTypeUpdate,
)

router = APIRouter()

# Advisory lock class for enablement changes: the "keep at least one active
# type" invariant must survive two concurrent deactivations (house pattern).
TYPE_LOCK_CLASSID = 427003


async def require_type_enabled(session: AsyncSession, project_id: uuid.UUID, type_key: str) -> None:
    """422 when the key is configured AND disabled for this project.

    A project with NO rows (rolling-deploy window) treats every type as
    enabled — validation only bites once configuration exists."""
    row = (
        await session.execute(
            select(ProjectType.is_active).where(
                ProjectType.project_id == project_id, ProjectType.key == type_key
            )
        )
    ).scalar_one_or_none()
    if row is False:
        raise HTTPException(
            status_code=422, detail=f"type '{type_key}' is disabled in this project"
        )


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
    return ProjectTypeList(items=[ProjectTypeRead.model_validate(r) for r in rows], total=len(rows))


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

    if fields.get("is_active") is False and row.is_active:
        # Serialize the invariant check per project: two concurrent
        # deactivations must not race past each other to zero active types.
        await session.execute(text("SET LOCAL lock_timeout = '5s'"))
        await session.execute(
            text("SELECT pg_advisory_xact_lock(:classid, hashtext(:pid))").bindparams(
                classid=TYPE_LOCK_CLASSID, pid=str(project_id)
            )
        )
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
    for key, value in fields.items():
        setattr(row, key, value)
    await session.commit()
    return ProjectTypeRead.model_validate(row)


@router.put("/projects/{project_id}/types/order", response_model=ProjectTypeList)
async def reorder_project_types(
    project_id: uuid.UUID,
    body: ProjectTypeReorder,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectTypeList:
    """Owner-only atomic reorder — same contract as the status reorder."""
    await require_role(session, project_id, user, {"owner"}, write=True)
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
    return ProjectTypeList(
        items=[ProjectTypeRead.model_validate(r) for r in ordered], total=len(ordered)
    )
