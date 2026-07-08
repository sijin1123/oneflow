import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete as sa_delete
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import is_member, require_member, require_role
from app.db.session import get_session
from app.models.member import ProjectMember
from app.models.module import Module, ModuleMember
from app.models.user import User
from app.models.work_package import WP_CLOSED_STATUSES, WorkPackage
from app.schemas.module import (
    ModuleCreate,
    ModuleList,
    ModuleMemberList,
    ModuleMemberRead,
    ModuleMembersPut,
    ModuleRead,
    ModuleUpdate,
)

router = APIRouter()

# Same permission split as cycles: managing modules is an owner action;
# assigning a work package to a module is a member action via the WP PATCH.


def _read(m: Module, total: int, done: int, member_count: int = 0) -> ModuleRead:
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
        member_count=member_count,
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


# Roster eligibility (Pass 65 v65.1): a participant COUNTS only while active
# AND a project member AND not a viewer. Reads re-filter every time — a stale
# roster row is invisible, never wrong.
def _eligible_join(stmt):
    return (
        stmt.join(
            ProjectMember,
            (ProjectMember.user_id == ModuleMember.user_id)
            & (ProjectMember.project_id == ModuleMember.project_id),
        )
        .join(User, User.id == ModuleMember.user_id)
        .where(ProjectMember.role != "viewer", User.is_active.is_(True))
    )


async def _member_counts(session: AsyncSession, project_id: uuid.UUID) -> dict[uuid.UUID, int]:
    rows = (
        await session.execute(
            _eligible_join(
                select(ModuleMember.module_id, func.count()).where(
                    ModuleMember.project_id == project_id
                )
            ).group_by(ModuleMember.module_id)
        )
    ).all()
    return dict(rows)


async def _roster(
    session: AsyncSession, project_id: uuid.UUID, module_id: uuid.UUID
) -> ModuleMemberList:
    rows = (
        await session.execute(
            _eligible_join(
                select(ModuleMember.user_id, User.display_name, User.email).where(
                    ModuleMember.module_id == module_id,
                    ModuleMember.project_id == project_id,
                )
            ).order_by(User.display_name.asc(), User.id.asc())
        )
    ).all()
    items = [
        ModuleMemberRead(user_id=uid, display_name=name, email=email) for uid, name, email in rows
    ]
    return ModuleMemberList(items=items, total=len(items))


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
    m_counts = await _member_counts(session, project_id)
    items = [_read(m, *counts.get(m.id, (0, 0)), m_counts.get(m.id, 0)) for m in rows]
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


@router.get("/projects/{project_id}/modules/{module_id}/members", response_model=ModuleMemberList)
async def list_module_members(
    project_id: uuid.UUID,
    module_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ModuleMemberList:
    await require_member(session, project_id, user)
    await _get_scoped(session, project_id, module_id)
    return await _roster(session, project_id, module_id)


@router.put("/projects/{project_id}/modules/{module_id}/members", response_model=ModuleMemberList)
async def replace_module_members(
    project_id: uuid.UUID,
    module_id: uuid.UUID,
    body: ModuleMembersPut,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ModuleMemberList:
    """Full replace under the SAME project advisory lock role changes use
    (427002) — a concurrent demotion/removal serializes against this write,
    and the conditional INSERT..SELECT re-checks eligibility at commit time
    (v65.1 R1-③). Two concurrent PUTs are last-write-wins by design (an
    informational roster — v65.1 R1-④)."""
    await require_role(session, project_id, user, {"owner"}, write=True)
    await _get_scoped(session, project_id, module_id)
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:classid, hashtext(:pid))").bindparams(
            classid=427002, pid=str(project_id)
        )
    )
    wanted = list(dict.fromkeys(body.user_ids))  # dedup, order-stable
    await session.execute(sa_delete(ModuleMember).where(ModuleMember.module_id == module_id))
    inserted = 0
    if wanted:
        eligible = set(
            (
                await session.execute(
                    select(ProjectMember.user_id)
                    .join(User, User.id == ProjectMember.user_id)
                    .where(
                        ProjectMember.project_id == project_id,
                        ProjectMember.user_id.in_(wanted),
                        ProjectMember.role != "viewer",
                        User.is_active.is_(True),
                    )
                )
            ).scalars()
        )
        for uid in wanted:
            if uid in eligible:
                session.add(ModuleMember(module_id=module_id, project_id=project_id, user_id=uid))
                inserted += 1
    if inserted != len(wanted):
        await session.rollback()
        raise HTTPException(
            status_code=422,
            detail="every participant must be an active, non-viewer project member",
        )
    await session.commit()
    return await _roster(session, project_id, module_id)
