"""Authorization hook + membership scope (PLAN §5).

First-PR policy: every non-health path is membership-scoped. Non-members get
404 (existence hiding) on single/detail/write paths; lists filter to member
projects. 403 is reserved for Phase 2 role-based denials.
"""

import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import ProjectMember
from app.models.user import User


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


async def require_role(
    session: AsyncSession, project_id: uuid.UUID, user: User, roles: set[str]
) -> str:
    """Membership + role gate (PLAN §5 Phase 2).

    Non-members get 404 (existence hiding). Members whose role is not in `roles`
    get 403 (the reserved 'member but insufficient role' case). Returns the role."""
    role = await member_role(session, project_id, user.id)
    if role is None:
        raise HTTPException(status_code=404, detail="not found")
    if role not in roles:
        raise HTTPException(status_code=403, detail="insufficient project role")
    return role


async def require_member(session: AsyncSession, project_id: uuid.UUID, user: User) -> None:
    if not await is_member(session, project_id, user.id):
        # Existence hiding: non-members cannot distinguish "absent" from "forbidden".
        raise HTTPException(status_code=404, detail="not found")


def authorize(user: User, action: str, resource: object | None = None) -> bool:
    """Interface anchor for Phase 2 roles. First PR: membership checks happen in
    require_member(); project:create is allowed for every authenticated user."""
    if action == "project:create":
        return True
    return True
