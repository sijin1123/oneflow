"""Workspace user directory (expansion PLAN Pass 33 PR-AY).

Contract (v33.1): admin-only — non-admins get 403 (the directory is not
existence-hidden the way project scopes are). `is_admin` gates ONLY this
surface and never bypasses project permissions (not a super-admin). The
workspace invariant is at least one ACTIVE admin (`is_admin AND is_active`),
enforced under a global advisory lock. Deactivation blocks authentication
only — memberships, assignments, and authored history stay intact; the one
new-reference write it closes is project member ADD (409 in members.py)."""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_session
from app.models.member import ProjectMember
from app.models.project import Project
from app.models.user import User
from app.schemas.user import (
    UserCreate,
    UserDirectoryList,
    UserDirectoryRead,
    UserDirectorySummary,
    UserMembershipList,
    UserMembershipRead,
    UserUpdate,
)

router = APIRouter()

# Global advisory lock serializing EVERY is_admin/is_active mutation, so the
# "keep at least one active admin" count-then-write cannot race two demotions
# or deactivations (427002 member-lock precedent; one workspace → one key).
USER_ADMIN_LOCK_CLASSID = 427005


def _require_admin(user: User) -> None:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="workspace admin required")


async def _lock_user_admin_state(session: AsyncSession) -> None:
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:classid, 0)").bindparams(
            classid=USER_ADMIN_LOCK_CLASSID
        )
    )


async def _active_admin_count(session: AsyncSession) -> int:
    return (
        await session.execute(
            select(func.count())
            .select_from(User)
            .where(User.is_admin.is_(True), User.is_active.is_(True))
        )
    ).scalar_one()


@router.get("/users", response_model=UserDirectoryList)
async def list_users(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=120),
    scope: Literal["all", "admins", "inactive"] = Query(default="all"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> UserDirectoryList:
    _require_admin(user)

    summary_row = (
        await session.execute(
            select(
                func.count(User.id),
                func.count(User.id).filter(User.is_active.is_(True)),
                func.count(User.id).filter(User.is_admin.is_(True)),
                func.count(User.id).filter(User.is_active.is_(False)),
                func.count(User.id).filter(User.is_admin.is_(True), User.is_active.is_(True)),
            )
        )
    ).one()
    summary = UserDirectorySummary(
        users=summary_row[0],
        active=summary_row[1],
        admins=summary_row[2],
        inactive=summary_row[3],
        active_admins=summary_row[4],
    )

    base = select(User)
    if scope == "admins":
        base = base.where(User.is_admin.is_(True))
    elif scope == "inactive":
        base = base.where(User.is_active.is_(False))
    needle = q.strip() if q else ""
    if needle:
        base = base.where(
            or_(
                User.display_name.icontains(needle, autoescape=True),
                User.email.icontains(needle, autoescape=True),
            )
        )
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        (
            await session.execute(
                base.order_by(func.lower(User.display_name).asc(), User.id.asc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    items = [UserDirectoryRead.model_validate(u) for u in rows]
    return UserDirectoryList(items=items, total=total, summary=summary)


@router.get("/users/{user_id}/memberships", response_model=UserMembershipList)
async def list_user_memberships(
    user_id: uuid.UUID,
    limit: int = Query(default=200, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> UserMembershipList:
    """Workspace governance READ (Pass 62 PR-CB, v62.1 R1-②): admins see a
    user's project memberships to verify offboarding — deliberately minimal
    fields, and read-only. Membership WRITES stay owner-only per project
    (Pass 33 invariant unchanged); offboarding's write tool is deactivation.
    Inactive users stay queryable (that is the offboarding-check use case)."""
    _require_admin(user)
    target = (await session.execute(select(User.id).where(User.id == user_id))).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="not found")
    base = (
        select(
            Project.id,
            Project.key,
            Project.name,
            ProjectMember.role,
            Project.archived_at,
        )
        .join(Project, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user_id)
    )
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await session.execute(
            base.order_by(Project.name.asc(), Project.id.asc()).limit(limit).offset(offset)
        )
    ).all()
    return UserMembershipList(
        items=[
            UserMembershipRead(
                project_id=pid,
                project_key=key,
                project_name=name,
                role=role,
                archived=archived_at is not None,
            )
            for pid, key, name, role, archived_at in rows
        ],
        total=total,
    )


@router.post("/users", response_model=UserDirectoryRead, status_code=201)
async def create_user(
    body: UserCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> UserDirectoryRead:
    _require_admin(user)
    # Directory registration only — never an admin grant (v33.1 R1-③).
    row = User(email=body.email, display_name=body.display_name, is_active=True, is_admin=False)
    try:
        session.add(row)
        await session.flush()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="a user with that email already exists"
        ) from exc
    return UserDirectoryRead.model_validate(row)


@router.patch("/users/{user_id}", response_model=UserDirectoryRead)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> UserDirectoryRead:
    _require_admin(user)
    fields = body.model_dump(exclude_unset=True)
    for key, value in fields.items():
        if value is None:
            raise HTTPException(status_code=422, detail=f"{key} cannot be null")
    # display_name-only edits don't touch the invariant — no lock needed.
    if "is_active" in fields or "is_admin" in fields:
        await _lock_user_admin_state(session)
    target = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="not found")
    if target.id == user.id and fields.get("is_active") is False:
        raise HTTPException(status_code=422, detail="you cannot deactivate yourself")
    for key, value in fields.items():
        setattr(target, key, value)
    await session.flush()
    # The invariant counts ACTIVE admins — a workspace where only deactivated
    # admins remain is unadministrable (v33.1 R1-①).
    if ("is_active" in fields or "is_admin" in fields) and await _active_admin_count(session) < 1:
        raise HTTPException(
            status_code=422, detail="the workspace must keep at least one active admin"
        )
    await session.commit()
    await session.refresh(target)
    return UserDirectoryRead.model_validate(target)
