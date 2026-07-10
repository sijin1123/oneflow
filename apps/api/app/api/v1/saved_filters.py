"""Named work-package views for a project (Phase 2 저장 필터 → Pass 2 Views).

Visibility: your own views plus members' shared views (author membership is
re-checked at query time — a departed author's shared views disappear and
return on re-join). Edits and deletes are strictly author-only; a non-author
gets 404, never 403, so view existence is not leaked."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member
from app.db.session import get_session
from app.models.member import ProjectMember
from app.models.saved_filter import SavedFilter
from app.models.user import User
from app.schemas.saved_filter import (
    SavedFilterCreate,
    SavedFilterList,
    SavedFilterParams,
    SavedFilterRead,
    SavedFilterUpdate,
)

router = APIRouter()


def _to_read(row: SavedFilter, *, me: uuid.UUID, owner_name: str) -> SavedFilterRead:
    return SavedFilterRead(
        id=row.id,
        project_id=row.project_id,
        name=row.name,
        params=SavedFilterParams(**(row.params or {})),
        layout=row.layout,
        sort=row.sort,
        is_shared=row.is_shared,
        is_locked=row.is_locked,
        is_mine=row.user_id == me,
        owner_name=owner_name,
        created_at=row.created_at,
    )


@router.get("/projects/{project_id}/saved-filters", response_model=SavedFilterList)
async def list_saved_filters(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SavedFilterList:
    await require_member(session, project_id, user)
    rows = (
        await session.execute(
            select(SavedFilter, User.display_name)
            .join(User, SavedFilter.user_id == User.id)
            # Shared views require the AUTHOR to still be a member (query-time).
            .join(
                ProjectMember,
                and_(
                    ProjectMember.project_id == SavedFilter.project_id,
                    ProjectMember.user_id == SavedFilter.user_id,
                ),
            )
            .where(
                SavedFilter.project_id == project_id,
                or_(SavedFilter.user_id == user.id, SavedFilter.is_shared.is_(True)),
            )
            .order_by(SavedFilter.created_at.asc(), SavedFilter.id.asc())
        )
    ).all()
    items = [_to_read(r, me=user.id, owner_name=name) for (r, name) in rows]
    return SavedFilterList(items=items, total=len(items))


@router.post(
    "/projects/{project_id}/saved-filters", response_model=SavedFilterRead, status_code=201
)
async def create_saved_filter(
    project_id: uuid.UUID,
    body: SavedFilterCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SavedFilterRead:
    await require_member(session, project_id, user, write=True)
    row = SavedFilter(
        project_id=project_id,
        user_id=user.id,
        name=body.name,
        params=body.params.model_dump(exclude_none=True),
        layout=body.layout,
        sort=body.sort,
        is_shared=body.is_shared,
    )
    try:
        session.add(row)
        await session.flush()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="a filter with that name already exists"
        ) from exc
    return _to_read(row, me=user.id, owner_name=user.display_name)


async def _get_own(
    session: AsyncSession, project_id: uuid.UUID, filter_id: uuid.UUID, user: User
) -> SavedFilter:
    row = (
        await session.execute(
            select(SavedFilter).where(
                SavedFilter.id == filter_id,
                SavedFilter.project_id == project_id,
                SavedFilter.user_id == user.id,  # author-only, 404 otherwise
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    return row


@router.patch("/projects/{project_id}/saved-filters/{filter_id}", response_model=SavedFilterRead)
async def update_saved_filter(
    project_id: uuid.UUID,
    filter_id: uuid.UUID,
    body: SavedFilterUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SavedFilterRead:
    await require_member(session, project_id, user, write=True)
    row = await _get_own(session, project_id, filter_id, user)
    fields = body.model_dump(exclude_unset=True)
    for key in ("name", "layout", "is_shared", "is_locked"):
        if key in fields and fields[key] is None:
            raise HTTPException(status_code=422, detail=f"{key} cannot be null")
    # Locked views accept the SINGLE-FIELD unlock only (v54.1 R1-⑤): the
    # two-step is the point of the guard.
    if row.is_locked and fields != {"is_locked": False}:
        raise HTTPException(status_code=409, detail="view is locked — unlock it first")
    try:
        for key, value in fields.items():
            setattr(row, key, value)
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="a filter with that name already exists"
        ) from exc
    return _to_read(row, me=user.id, owner_name=user.display_name)


@router.delete("/projects/{project_id}/saved-filters/{filter_id}", status_code=204)
async def delete_saved_filter(
    project_id: uuid.UUID,
    filter_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await require_member(session, project_id, user, write=True)
    row = await _get_own(session, project_id, filter_id, user)
    if row.is_locked:
        raise HTTPException(status_code=409, detail="view is locked — unlock it first")
    await session.delete(row)
    await session.commit()
    return Response(status_code=204)
