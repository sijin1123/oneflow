import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import is_member, require_member, require_role
from app.db.session import get_session
from app.models.module import Module
from app.models.user import User
from app.models.work_package import WP_CLOSED_STATUSES, WorkPackage
from app.schemas.module import ModuleCreate, ModuleList, ModuleRead, ModuleUpdate

router = APIRouter()

# Same permission split as cycles: managing modules is an owner action;
# assigning a work package to a module is a member action via the WP PATCH.


def _read(m: Module, total: int, done: int) -> ModuleRead:
    return ModuleRead(
        id=m.id,
        project_id=m.project_id,
        name=m.name,
        description=m.description,
        lead_id=m.lead_id,
        state=m.state,
        start_date=m.start_date,
        target_date=m.target_date,
        work_package_count=total,
        done_work_package_count=done,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


async def _counts(session: AsyncSession, project_id: uuid.UUID) -> dict[uuid.UUID, tuple[int, int]]:
    """Per-module (total, done) work-package counts in ONE aggregate query."""
    done = func.count().filter(WorkPackage.status.in_(WP_CLOSED_STATUSES))
    rows = (
        await session.execute(
            select(WorkPackage.module_id, func.count(), done)
            .where(WorkPackage.project_id == project_id, WorkPackage.module_id.is_not(None))
            .group_by(WorkPackage.module_id)
        )
    ).all()
    return {module_id: (total, done_n) for (module_id, total, done_n) in rows}


async def _get_scoped(session: AsyncSession, project_id: uuid.UUID, module_id: uuid.UUID) -> Module:
    m = (await session.execute(select(Module).where(Module.id == module_id))).scalar_one_or_none()
    if m is None or m.project_id != project_id:
        raise HTTPException(status_code=404, detail="not found")
    return m


async def _require_lead_member(
    session: AsyncSession, project_id: uuid.UUID, lead_id: uuid.UUID
) -> None:
    # Lead must be a member AT WRITE TIME; later removal keeps the lead (history).
    if not await is_member(session, project_id, lead_id):
        raise HTTPException(status_code=422, detail="lead must be a member of the project")


@router.get("/projects/{project_id}/modules", response_model=ModuleList)
async def list_modules(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ModuleList:
    await require_member(session, project_id, user)
    rows = (
        (
            await session.execute(
                select(Module).where(Module.project_id == project_id).order_by(Module.name.asc())
            )
        )
        .scalars()
        .all()
    )
    counts = await _counts(session, project_id)
    items = [_read(m, *counts.get(m.id, (0, 0))) for m in rows]
    return ModuleList(items=items, total=len(items))


@router.post("/projects/{project_id}/modules", response_model=ModuleRead, status_code=201)
async def create_module(
    project_id: uuid.UUID,
    body: ModuleCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ModuleRead:
    await require_role(session, project_id, user, {"owner"}, write=True)
    if body.lead_id is not None:
        await _require_lead_member(session, project_id, body.lead_id)
    if body.start_date and body.target_date and body.start_date > body.target_date:
        raise HTTPException(status_code=422, detail="start_date must be on or before target_date")
    m = Module(
        project_id=project_id,
        name=body.name,
        description=body.description,
        lead_id=body.lead_id,
        state=body.state,
        start_date=body.start_date,
        target_date=body.target_date,
    )
    session.add(m)
    await session.commit()
    return _read(m, 0, 0)


@router.patch("/projects/{project_id}/modules/{module_id}", response_model=ModuleRead)
async def update_module(
    project_id: uuid.UUID,
    module_id: uuid.UUID,
    body: ModuleUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ModuleRead:
    await require_role(session, project_id, user, {"owner"}, write=True)
    m = await _get_scoped(session, project_id, module_id)
    fields = body.model_dump(exclude_unset=True)
    for key in ("name", "state"):
        if key in fields and fields[key] is None:
            raise HTTPException(status_code=422, detail=f"{key} cannot be null")
    if fields.get("lead_id") is not None:
        await _require_lead_member(session, project_id, fields["lead_id"])
    # Cross-field check on the MERGED optional range (both bounds may be null).
    start = fields.get("start_date", m.start_date)
    target = fields.get("target_date", m.target_date)
    if start and target and start > target:
        raise HTTPException(status_code=422, detail="start_date must be on or before target_date")
    for key, value in fields.items():
        setattr(m, key, value)
    await session.commit()
    await session.refresh(m)  # onupdate updated_at is server-computed
    counts = await _counts(session, project_id)
    return _read(m, *counts.get(m.id, (0, 0)))


@router.delete("/projects/{project_id}/modules/{module_id}", status_code=204)
async def delete_module(
    project_id: uuid.UUID,
    module_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await require_role(session, project_id, user, {"owner"}, write=True)
    m = await _get_scoped(session, project_id, module_id)
    # The UI confirm shows work_package_count; the DB clears only module_id.
    await session.delete(m)
    await session.commit()
    return Response(status_code=204)
