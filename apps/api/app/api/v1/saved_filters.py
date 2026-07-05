"""Per-user saved filters for a project's work-package list (PLAN §3 Phase 2)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member
from app.db.session import get_session
from app.models.saved_filter import SavedFilter
from app.models.user import User
from app.schemas.saved_filter import (
    SavedFilterCreate,
    SavedFilterList,
    SavedFilterParams,
    SavedFilterRead,
)

router = APIRouter()


def _to_read(row: SavedFilter) -> SavedFilterRead:
    return SavedFilterRead(
        id=row.id,
        project_id=row.project_id,
        name=row.name,
        params=SavedFilterParams(**(row.params or {})),
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
        (
            await session.execute(
                select(SavedFilter)
                .where(SavedFilter.project_id == project_id, SavedFilter.user_id == user.id)
                .order_by(SavedFilter.created_at.asc(), SavedFilter.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return SavedFilterList(items=[_to_read(r) for r in rows], total=len(rows))


@router.post(
    "/projects/{project_id}/saved-filters", response_model=SavedFilterRead, status_code=201
)
async def create_saved_filter(
    project_id: uuid.UUID,
    body: SavedFilterCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SavedFilterRead:
    await require_member(session, project_id, user)
    row = SavedFilter(
        project_id=project_id,
        user_id=user.id,
        name=body.name,
        params=body.params.model_dump(exclude_none=True),
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
    return _to_read(row)


@router.delete("/projects/{project_id}/saved-filters/{filter_id}", status_code=204)
async def delete_saved_filter(
    project_id: uuid.UUID,
    filter_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await require_member(session, project_id, user)
    row = (
        await session.execute(
            select(SavedFilter).where(
                SavedFilter.id == filter_id,
                SavedFilter.project_id == project_id,
                SavedFilter.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    await session.delete(row)
    await session.commit()
    return Response(status_code=204)
