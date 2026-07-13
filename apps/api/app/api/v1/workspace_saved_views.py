"""Private, conflict-safe saved views for the cross-project workspace surface."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_session
from app.models.user import User
from app.models.workspace_saved_view import WorkspaceSavedView
from app.schemas.workspace_saved_view import (
    MAX_INT4,
    WorkspaceSavedViewConflict,
    WorkspaceSavedViewCreate,
    WorkspaceSavedViewError,
    WorkspaceSavedViewList,
    WorkspaceSavedViewParams,
    WorkspaceSavedViewRead,
    WorkspaceSavedViewUpdate,
)
from app.services.workspace_pql import PqlError, parse_pql, validate_pql_values

router = APIRouter()

WORKSPACE_VIEW_LIMIT = 50
WORKSPACE_VIEW_LOCK_CLASSID = 427014


async def _lock_user_views(session: AsyncSession, user_id: uuid.UUID) -> None:
    try:
        await session.execute(text("SET LOCAL lock_timeout = '5s'"))
        await session.execute(
            text("SELECT pg_advisory_xact_lock(:classid, hashtext(:uid))").bindparams(
                classid=WORKSPACE_VIEW_LOCK_CLASSID,
                uid=str(user_id),
            )
        )
    except DBAPIError as exc:
        await session.rollback()
        if getattr(exc.orig, "sqlstate", None) == "55P03":
            raise HTTPException(
                status_code=503,
                detail="workspace views busy - retry shortly",
            ) from exc
        raise


def _read(row: WorkspaceSavedView) -> WorkspaceSavedViewRead:
    return WorkspaceSavedViewRead(
        id=row.id,
        name=row.name,
        params=WorkspaceSavedViewParams(**(row.params or {})),
        version=row.version,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


async def _own_or_404(
    session: AsyncSession,
    view_id: uuid.UUID,
    user_id: uuid.UUID,
) -> WorkspaceSavedView:
    row = (
        await session.execute(
            select(WorkspaceSavedView).where(
                WorkspaceSavedView.id == view_id,
                WorkspaceSavedView.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    return row


async def _conflict_or_404(
    session: AsyncSession,
    view_id: uuid.UUID,
    user_id: uuid.UUID,
) -> JSONResponse:
    current = await _own_or_404(session, view_id, user_id)
    payload = WorkspaceSavedViewConflict(current=_read(current))
    return JSONResponse(status_code=409, content=jsonable_encoder(payload))


def _duplicate_name() -> HTTPException:
    return HTTPException(status_code=409, detail="a workspace view with this name already exists")


async def _validate_pql_params(
    session: AsyncSession,
    user: User,
    params: WorkspaceSavedViewParams | None,
) -> None:
    if params is None or params.filter_mode != "pql":
        return
    try:
        await validate_pql_values(session, user, parse_pql(params.pql))
    except PqlError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/me/workspace-views", response_model=WorkspaceSavedViewList)
async def list_workspace_saved_views(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceSavedViewList:
    rows = (
        (
            await session.execute(
                select(WorkspaceSavedView)
                .where(WorkspaceSavedView.user_id == user.id)
                .order_by(WorkspaceSavedView.updated_at.desc(), WorkspaceSavedView.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return WorkspaceSavedViewList(items=[_read(row) for row in rows], total=len(rows))


@router.post(
    "/me/workspace-views",
    response_model=WorkspaceSavedViewRead,
    status_code=201,
    responses={409: {"model": WorkspaceSavedViewError}, 503: {"model": WorkspaceSavedViewError}},
)
async def create_workspace_saved_view(
    body: WorkspaceSavedViewCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceSavedViewRead:
    await _validate_pql_params(session, user, body.params)
    await _lock_user_views(session, user.id)
    count = (
        await session.execute(select(func.count()).where(WorkspaceSavedView.user_id == user.id))
    ).scalar_one()
    if count >= WORKSPACE_VIEW_LIMIT:
        raise HTTPException(status_code=409, detail="workspace view limit (50) reached")
    row = WorkspaceSavedView(
        user_id=user.id,
        name=body.name,
        params=body.params.model_dump(),
    )
    session.add(row)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise _duplicate_name() from exc
    await session.commit()
    await session.refresh(row)
    return _read(row)


@router.patch(
    "/me/workspace-views/{view_id}",
    response_model=WorkspaceSavedViewRead,
    responses={
        409: {"model": WorkspaceSavedViewConflict},
        503: {"model": WorkspaceSavedViewError},
    },
)
async def update_workspace_saved_view(
    view_id: uuid.UUID,
    body: WorkspaceSavedViewUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceSavedViewRead | JSONResponse:
    await _validate_pql_params(session, user, body.params)
    await _lock_user_views(session, user.id)
    current = await _own_or_404(session, view_id, user.id)
    if current.version >= MAX_INT4 and body.expected_version == current.version:
        payload = WorkspaceSavedViewConflict(
            detail="workspace view version limit reached",
            current=_read(current),
        )
        return JSONResponse(status_code=409, content=jsonable_encoder(payload))
    values = body.model_dump(exclude_unset=True, exclude={"expected_version"})
    if "params" in values:
        values["params"] = body.params.model_dump()  # type: ignore[union-attr]
    values["version"] = WorkspaceSavedView.version + 1
    values["updated_at"] = func.now()
    try:
        result = await session.execute(
            update(WorkspaceSavedView)
            .where(
                WorkspaceSavedView.id == view_id,
                WorkspaceSavedView.user_id == user.id,
                WorkspaceSavedView.version == body.expected_version,
            )
            .values(**values)
            .returning(WorkspaceSavedView)
        )
    except IntegrityError as exc:
        await session.rollback()
        raise _duplicate_name() from exc
    row = result.scalar_one_or_none()
    if row is None:
        return await _conflict_or_404(session, view_id, user.id)
    await session.commit()
    return _read(row)


@router.delete(
    "/me/workspace-views/{view_id}",
    status_code=204,
    response_model=None,
    responses={
        409: {"model": WorkspaceSavedViewConflict},
        503: {"model": WorkspaceSavedViewError},
    },
)
async def delete_workspace_saved_view(
    view_id: uuid.UUID,
    expected_version: int = Query(ge=0, le=2_147_483_647),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response | JSONResponse:
    await _lock_user_views(session, user.id)
    result = await session.execute(
        delete(WorkspaceSavedView)
        .where(
            WorkspaceSavedView.id == view_id,
            WorkspaceSavedView.user_id == user.id,
            WorkspaceSavedView.version == expected_version,
        )
        .returning(WorkspaceSavedView.id)
    )
    if result.scalar_one_or_none() is None:
        return await _conflict_or_404(session, view_id, user.id)
    await session.commit()
    return Response(status_code=204)
