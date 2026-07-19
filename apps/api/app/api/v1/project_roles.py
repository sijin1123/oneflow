import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.permissions import DELEGABLE_PROJECT_PERMISSIONS, PERMISSION_MATRIX
from app.db.session import get_session
from app.models.member import ProjectMember
from app.models.project_role import ProjectRole, ProjectRoleEvent
from app.models.user import User
from app.schemas.project_role import (
    MAX_CUSTOM_PROJECT_ROLES,
    ProjectRoleCapability,
    ProjectRoleCapabilityList,
    ProjectRoleCatalogItem,
    ProjectRoleCatalogList,
    ProjectRoleCreate,
    ProjectRoleEventList,
    ProjectRoleEventRead,
    ProjectRoleList,
    ProjectRoleRead,
    ProjectRoleRevision,
    ProjectRoleUpdate,
)

router = APIRouter()
ROLE_CATALOG_LOCK_CLASSID = 427016


def _require_admin(user: User) -> None:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="workspace admin required")


async def _lock_catalog(session: AsyncSession) -> None:
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:classid, 1)").bindparams(
            classid=ROLE_CATALOG_LOCK_CLASSID
        )
    )


def _snapshot(role: ProjectRole) -> dict:
    return {
        "name": role.name,
        "description": role.description,
        "permissions": list(role.permissions),
        "archived": role.archived_at is not None,
    }


def _event(role: ProjectRole, user: User, event_type: str) -> ProjectRoleEvent:
    return ProjectRoleEvent(
        role_id=role.id,
        actor_id=user.id,
        actor_name=user.display_name,
        event_type=event_type,
        revision=role.revision,
        snapshot=_snapshot(role),
    )


async def _locked_role(session: AsyncSession, role_id: uuid.UUID) -> ProjectRole:
    role = (
        await session.execute(
            select(ProjectRole).where(ProjectRole.id == role_id).with_for_update()
        )
    ).scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="project role not found")
    return role


def _require_revision(role: ProjectRole, expected_revision: int) -> None:
    if role.revision != expected_revision:
        raise HTTPException(
            status_code=412,
            detail={"code": "stale_revision", "current_revision": role.revision},
        )


async def _reads(session: AsyncSession, roles: list[ProjectRole]) -> list[ProjectRoleRead]:
    role_ids = [role.id for role in roles]
    counts: dict[uuid.UUID, int] = {}
    if role_ids:
        counts = dict(
            (
                await session.execute(
                    select(ProjectMember.custom_role_id, func.count(ProjectMember.id))
                    .where(ProjectMember.custom_role_id.in_(role_ids))
                    .group_by(ProjectMember.custom_role_id)
                )
            ).all()
        )
    return [
        ProjectRoleRead(
            id=role.id,
            name=role.name,
            description=role.description,
            permissions=list(role.permissions),
            revision=role.revision,
            archived_at=role.archived_at,
            assigned_member_count=counts.get(role.id, 0),
            created_by_user_id=role.created_by_user_id,
            created_by_name=role.created_by_name,
            updated_by_user_id=role.updated_by_user_id,
            updated_by_name=role.updated_by_name,
            created_at=role.created_at,
            updated_at=role.updated_at,
        )
        for role in roles
    ]


@router.get(
    "/workspace/project-role-capabilities",
    response_model=ProjectRoleCapabilityList,
)
async def list_project_role_capabilities(
    user: User = Depends(get_current_user),
) -> ProjectRoleCapabilityList:
    del user
    rows = {str(row["key"]): row for row in PERMISSION_MATRIX}
    items = [
        ProjectRoleCapability(
            key=key,
            label=str(rows[key]["label"]),
            note=rows[key]["note"],
        )
        for key in DELEGABLE_PROJECT_PERMISSIONS
    ]
    return ProjectRoleCapabilityList(items=items, total=len(items))


@router.get("/workspace/project-roles", response_model=ProjectRoleCatalogList)
async def list_active_project_roles(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectRoleCatalogList:
    del user
    roles = (
        (
            await session.execute(
                select(ProjectRole)
                .where(ProjectRole.archived_at.is_(None))
                .order_by(func.lower(ProjectRole.name), ProjectRole.id)
            )
        )
        .scalars()
        .all()
    )
    items = [
        ProjectRoleCatalogItem(
            id=role.id,
            name=role.name,
            description=role.description,
            permissions=list(role.permissions),
            revision=role.revision,
        )
        for role in roles
    ]
    return ProjectRoleCatalogList(items=items, total=len(items))


@router.get("/admin/workspace/project-roles", response_model=ProjectRoleList)
async def list_admin_project_roles(
    include_archived: bool = Query(default=False),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectRoleList:
    _require_admin(user)
    query = select(ProjectRole)
    if not include_archived:
        query = query.where(ProjectRole.archived_at.is_(None))
    roles = (
        (
            await session.execute(
                query.order_by(
                    ProjectRole.archived_at.asc().nulls_first(),
                    func.lower(ProjectRole.name),
                    ProjectRole.id,
                )
            )
        )
        .scalars()
        .all()
    )
    items = await _reads(session, list(roles))
    return ProjectRoleList(items=items, total=len(items))


@router.post(
    "/admin/workspace/project-roles",
    response_model=ProjectRoleRead,
    status_code=201,
)
async def create_project_role(
    body: ProjectRoleCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectRoleRead:
    _require_admin(user)
    await _lock_catalog(session)
    total = await session.scalar(select(func.count()).select_from(ProjectRole))
    if (total or 0) >= MAX_CUSTOM_PROJECT_ROLES:
        raise HTTPException(
            status_code=409,
            detail=f"workspace supports at most {MAX_CUSTOM_PROJECT_ROLES} custom project roles",
        )
    role = ProjectRole(
        id=uuid.uuid4(),
        name=body.name,
        description=body.description,
        permissions=body.permissions,
        revision=1,
        created_by_user_id=user.id,
        created_by_name=user.display_name,
        updated_by_user_id=user.id,
        updated_by_name=user.display_name,
    )
    session.add(role)
    try:
        await session.flush()
        session.add(_event(role, user, "created"))
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="project role name already exists") from exc
    await session.refresh(role)
    return (await _reads(session, [role]))[0]


@router.patch(
    "/admin/workspace/project-roles/{role_id}",
    response_model=ProjectRoleRead,
)
async def update_project_role(
    role_id: uuid.UUID,
    body: ProjectRoleUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectRoleRead:
    _require_admin(user)
    role = await _locked_role(session, role_id)
    _require_revision(role, body.expected_revision)
    if role.archived_at is not None:
        raise HTTPException(status_code=409, detail="restore the project role before editing")
    changes = body.model_fields_set - {"expected_revision"}
    if "name" in changes:
        role.name = body.name or role.name
    if "description" in changes:
        role.description = body.description
    if "permissions" in changes:
        role.permissions = body.permissions or []
    role.revision += 1
    role.updated_by_user_id = user.id
    role.updated_by_name = user.display_name
    role.updated_at = datetime.now(UTC)
    try:
        session.add(_event(role, user, "updated"))
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="project role name already exists") from exc
    await session.refresh(role)
    return (await _reads(session, [role]))[0]


async def _set_archive(
    *,
    role_id: uuid.UUID,
    body: ProjectRoleRevision,
    archived: bool,
    session: AsyncSession,
    user: User,
) -> ProjectRoleRead:
    role = await _locked_role(session, role_id)
    _require_revision(role, body.expected_revision)
    changed = (role.archived_at is None) == archived
    if changed:
        role.archived_at = datetime.now(UTC) if archived else None
        role.revision += 1
        role.updated_by_user_id = user.id
        role.updated_by_name = user.display_name
        role.updated_at = datetime.now(UTC)
        session.add(_event(role, user, "archived" if archived else "restored"))
        await session.commit()
        await session.refresh(role)
    return (await _reads(session, [role]))[0]


@router.post(
    "/admin/workspace/project-roles/{role_id}/archive",
    response_model=ProjectRoleRead,
)
async def archive_project_role(
    role_id: uuid.UUID,
    body: ProjectRoleRevision,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectRoleRead:
    _require_admin(user)
    return await _set_archive(
        role_id=role_id,
        body=body,
        archived=True,
        session=session,
        user=user,
    )


@router.post(
    "/admin/workspace/project-roles/{role_id}/restore",
    response_model=ProjectRoleRead,
)
async def restore_project_role(
    role_id: uuid.UUID,
    body: ProjectRoleRevision,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectRoleRead:
    _require_admin(user)
    return await _set_archive(
        role_id=role_id,
        body=body,
        archived=False,
        session=session,
        user=user,
    )


@router.get(
    "/admin/workspace/project-roles/{role_id}/events",
    response_model=ProjectRoleEventList,
)
async def list_project_role_events(
    role_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectRoleEventList:
    _require_admin(user)
    if await session.get(ProjectRole, role_id) is None:
        raise HTTPException(status_code=404, detail="project role not found")
    total = await session.scalar(
        select(func.count())
        .select_from(ProjectRoleEvent)
        .where(ProjectRoleEvent.role_id == role_id)
    )
    events = (
        (
            await session.execute(
                select(ProjectRoleEvent)
                .where(ProjectRoleEvent.role_id == role_id)
                .order_by(ProjectRoleEvent.created_at.desc(), ProjectRoleEvent.id.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    items = [ProjectRoleEventRead.model_validate(event) for event in events]
    return ProjectRoleEventList(
        items=items,
        total=total or 0,
        limit=limit,
        offset=offset,
    )
