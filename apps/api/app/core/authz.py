"""Authorization hook + membership scope (PLAN §5).

First-PR policy: every non-health path is membership-scoped. Non-members get
404 (existence hiding) on single/detail/write paths; lists filter to member
projects. 403 is reserved for Phase 2 role-based denials.
"""

import uuid
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import ALWAYS, PERMISSION_MATRIX
from app.models.member import ProjectMember
from app.models.project import Project
from app.models.project_role import ProjectRole
from app.models.user import User


@dataclass(frozen=True)
class ProjectAccess:
    role: str
    custom_role_id: uuid.UUID | None
    custom_role_name: str | None
    custom_permissions: frozenset[str]


async def is_member(session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    row = await session.execute(
        select(ProjectMember.id).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
        )
    )
    return row.first() is not None


async def member_role(
    session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID
) -> str | None:
    return (
        await session.execute(
            select(ProjectMember.role).where(
                ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
            )
        )
    ).scalar_one_or_none()


async def member_access(
    session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID
) -> ProjectAccess | None:
    row = (
        await session.execute(
            select(
                ProjectMember.role,
                ProjectMember.custom_role_id,
                ProjectRole.name,
                ProjectRole.permissions,
            )
            .outerjoin(ProjectRole, ProjectRole.id == ProjectMember.custom_role_id)
            .where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
            )
        )
    ).one_or_none()
    if row is None:
        return None
    role, custom_role_id, custom_role_name, custom_permissions = row
    return ProjectAccess(
        role=role,
        custom_role_id=custom_role_id,
        custom_role_name=custom_role_name,
        custom_permissions=frozenset(custom_permissions or []),
    )


def permission_level(access: ProjectAccess, verb: str) -> str:
    row = next((item for item in PERMISSION_MATRIX if item["key"] == verb), None)
    if row is None:
        raise ValueError(f"unknown project permission: {verb}")
    if access.role == "member" and verb in access.custom_permissions:
        return ALWAYS
    return str(row[access.role])


async def member_has_permission(
    session: AsyncSession,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    verb: str,
) -> bool:
    access = await member_access(session, project_id, user_id)
    return access is not None and permission_level(access, verb) == ALWAYS


async def require_permission(
    session: AsyncSession,
    project_id: uuid.UUID,
    user: User,
    verb: str,
    *,
    write: bool = False,
) -> ProjectAccess:
    access = await member_access(session, project_id, user.id)
    if access is None:
        raise HTTPException(status_code=404, detail="not found")
    if permission_level(access, verb) != ALWAYS:
        raise HTTPException(status_code=403, detail="insufficient project permission")
    if write:
        await require_active_project(session, project_id)
    return access


async def require_active_project(session: AsyncSession, project_id: uuid.UUID) -> None:
    """Archived projects are read-only: every project-scoped WRITE calls this
    (write=True on the membership guards) and gets a 409. Reads, exports and
    the danger-zone restore endpoint stay available (Pass 2 PR-G)."""
    archived = (
        await session.execute(select(Project.archived_at).where(Project.id == project_id))
    ).scalar_one_or_none()
    if archived is not None:
        raise HTTPException(status_code=409, detail="project is archived")


async def require_role(
    session: AsyncSession,
    project_id: uuid.UUID,
    user: User,
    roles: set[str],
    *,
    write: bool = False,
) -> str:
    """Membership + role gate (PLAN §5 Phase 2).

    Non-members get 404 (existence hiding). Members whose role is not in `roles`
    get 403 (the reserved 'member but insufficient role' case). Returns the role."""
    role = await member_role(session, project_id, user.id)
    if role is None:
        raise HTTPException(status_code=404, detail="not found")
    if role not in roles:
        raise HTTPException(status_code=403, detail="insufficient project role")
    if write:
        await require_active_project(session, project_id)
    return role


async def require_member(
    session: AsyncSession, project_id: uuid.UUID, user: User, *, write: bool = False
) -> None:
    role = await member_role(session, project_id, user.id)
    if role is None:
        # Existence hiding: non-members cannot distinguish "absent" from "forbidden".
        raise HTTPException(status_code=404, detail="not found")
    if write:
        # A viewer is a full member for reads but never writes (Pass 61).
        if role == "viewer":
            raise HTTPException(status_code=403, detail="read-only role")
        await require_active_project(session, project_id)


async def require_writer(session: AsyncSession, project_id: uuid.UUID, user_id) -> None:
    """Viewer write-guard for helpers that scope by is_member() and add
    require_active_project() themselves (WP/meeting/document scoped fetches).
    Call it in every write branch alongside the archive guard (Pass 61)."""
    if await member_role(session, project_id, user_id) == "viewer":
        raise HTTPException(status_code=403, detail="read-only role")


def authorize(user: User, action: str, resource: object | None = None) -> bool:
    """Interface anchor for Phase 2 roles. First PR: membership checks happen in
    require_member(); project:create is allowed for every authenticated user."""
    if action == "project:create":
        return True
    return True
