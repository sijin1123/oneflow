"""Workspace user directory (expansion PLAN Pass 33 PR-AY).

Contract (v33.1): admin-only — non-admins get 403 (the directory is not
existence-hidden the way project scopes are). `is_admin` gates ONLY this
surface and never bypasses project permissions (not a super-admin). The
workspace invariant is at least one ACTIVE admin (`is_admin AND is_active`),
enforced under a global advisory lock. Deactivation blocks authentication
only — memberships, assignments, and authored history stay intact; the one
new-reference write it closes is project member ADD (409 in members.py)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_session
from app.models.user import User
from app.schemas.user import (
    UserCreate,
    UserDirectoryList,
    UserDirectoryRead,
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
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> UserDirectoryList:
    _require_admin(user)
    rows = (
        (await session.execute(select(User).order_by(User.display_name.asc(), User.id.asc())))
        .scalars()
        .all()
    )
    items = [UserDirectoryRead.model_validate(u) for u in rows]
    return UserDirectoryList(items=items, total=len(items))


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
