"""Private, conflict-safe Workspace Home quick links."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_session
from app.models.user import User
from app.models.workspace_quick_link import WorkspaceQuickLink
from app.schemas.workspace_quick_link import (
    WorkspaceQuickLinkConflict,
    WorkspaceQuickLinkCreate,
    WorkspaceQuickLinkError,
    WorkspaceQuickLinkList,
    WorkspaceQuickLinkOrder,
    WorkspaceQuickLinkRead,
    WorkspaceQuickLinkUpdate,
)

router = APIRouter()

WORKSPACE_QUICK_LINK_LIMIT = 8
WORKSPACE_QUICK_LINK_LOCK_CLASSID = 427020


async def _lock_user_links(session: AsyncSession, user_id: uuid.UUID) -> None:
    try:
        await session.execute(text("SET LOCAL lock_timeout = '5s'"))
        await session.execute(
            text("SELECT pg_advisory_xact_lock(:classid, hashtext(:uid))").bindparams(
                classid=WORKSPACE_QUICK_LINK_LOCK_CLASSID, uid=str(user_id)
            )
        )
    except DBAPIError as exc:
        await session.rollback()
        if getattr(exc.orig, "sqlstate", None) == "55P03":
            raise HTTPException(
                status_code=503, detail="workspace quick links busy - retry shortly"
            ) from exc
        raise


def _read(link: WorkspaceQuickLink) -> WorkspaceQuickLinkRead:
    return WorkspaceQuickLinkRead.model_validate(link)


async def _own_or_404(
    session: AsyncSession, link_id: uuid.UUID, user_id: uuid.UUID
) -> WorkspaceQuickLink:
    link = (
        await session.execute(
            select(WorkspaceQuickLink).where(
                WorkspaceQuickLink.id == link_id,
                WorkspaceQuickLink.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="not found")
    return link


async def _conflict_or_404(
    session: AsyncSession, link_id: uuid.UUID, user_id: uuid.UUID
) -> JSONResponse:
    current = await _own_or_404(session, link_id, user_id)
    return JSONResponse(
        status_code=409,
        content=jsonable_encoder(WorkspaceQuickLinkConflict(current=_read(current))),
    )


async def _list(session: AsyncSession, user_id: uuid.UUID) -> WorkspaceQuickLinkList:
    rows = (
        (
            await session.execute(
                select(WorkspaceQuickLink)
                .where(WorkspaceQuickLink.user_id == user_id)
                .order_by(WorkspaceQuickLink.position.asc(), WorkspaceQuickLink.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return WorkspaceQuickLinkList(items=[_read(link) for link in rows], total=len(rows))


@router.get("/me/quick-links", response_model=WorkspaceQuickLinkList)
async def list_workspace_quick_links(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceQuickLinkList:
    return await _list(session, user.id)


@router.post(
    "/me/quick-links",
    response_model=WorkspaceQuickLinkRead,
    status_code=201,
    responses={409: {"model": WorkspaceQuickLinkError}, 503: {"model": WorkspaceQuickLinkError}},
)
async def create_workspace_quick_link(
    body: WorkspaceQuickLinkCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceQuickLinkRead:
    await _lock_user_links(session, user.id)
    count = (
        await session.execute(select(func.count()).where(WorkspaceQuickLink.user_id == user.id))
    ).scalar_one()
    if count >= WORKSPACE_QUICK_LINK_LIMIT:
        raise HTTPException(status_code=409, detail="workspace quick link limit (8) reached")
    position = (
        await session.execute(
            select(func.coalesce(func.max(WorkspaceQuickLink.position), -1) + 1).where(
                WorkspaceQuickLink.user_id == user.id
            )
        )
    ).scalar_one()
    link = WorkspaceQuickLink(
        user_id=user.id,
        title=body.title,
        destination=body.destination,
        position=position,
    )
    session.add(link)
    await session.flush()
    await session.commit()
    await session.refresh(link)
    return _read(link)


@router.patch(
    "/me/quick-links/{link_id}",
    response_model=WorkspaceQuickLinkRead,
    responses={
        409: {"model": WorkspaceQuickLinkConflict},
        503: {"model": WorkspaceQuickLinkError},
    },
)
async def update_workspace_quick_link(
    link_id: uuid.UUID,
    body: WorkspaceQuickLinkUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceQuickLinkRead | JSONResponse:
    await _lock_user_links(session, user.id)
    await _own_or_404(session, link_id, user.id)
    values = body.model_dump(exclude_unset=True, exclude={"expected_version"})
    values["version"] = WorkspaceQuickLink.version + 1
    values["updated_at"] = func.now()
    result = await session.execute(
        update(WorkspaceQuickLink)
        .where(
            WorkspaceQuickLink.id == link_id,
            WorkspaceQuickLink.user_id == user.id,
            WorkspaceQuickLink.version == body.expected_version,
        )
        .values(**values)
        .returning(WorkspaceQuickLink)
    )
    link = result.scalar_one_or_none()
    if link is None:
        return await _conflict_or_404(session, link_id, user.id)
    await session.commit()
    return _read(link)


@router.put(
    "/me/quick-links/order",
    response_model=WorkspaceQuickLinkList,
    responses={
        409: {"model": WorkspaceQuickLinkConflict},
        503: {"model": WorkspaceQuickLinkError},
    },
)
async def order_workspace_quick_links(
    body: WorkspaceQuickLinkOrder,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceQuickLinkList | JSONResponse:
    await _lock_user_links(session, user.id)
    rows = (
        (
            await session.execute(
                select(WorkspaceQuickLink).where(WorkspaceQuickLink.user_id == user.id)
            )
        )
        .scalars()
        .all()
    )
    by_id = {link.id: link for link in rows}
    requested = [item.id for item in body.items]
    if len(requested) != len(set(requested)) or set(requested) != set(by_id):
        raise HTTPException(
            status_code=422, detail="items must list exactly all of your quick links once"
        )
    for position, item in enumerate(body.items):
        link = by_id[item.id]
        if link.version != item.expected_version:
            return JSONResponse(
                status_code=409,
                content=jsonable_encoder(WorkspaceQuickLinkConflict(current=_read(link))),
            )
        link.position = position
        link.version += 1
    await session.flush()
    payload = await _list(session, user.id)
    await session.commit()
    return payload


@router.delete(
    "/me/quick-links/{link_id}",
    status_code=204,
    response_model=None,
    responses={
        409: {"model": WorkspaceQuickLinkConflict},
        503: {"model": WorkspaceQuickLinkError},
    },
)
async def delete_workspace_quick_link(
    link_id: uuid.UUID,
    expected_version: int = Query(ge=0, le=2_147_483_647),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response | JSONResponse:
    await _lock_user_links(session, user.id)
    await _own_or_404(session, link_id, user.id)
    result = await session.execute(
        WorkspaceQuickLink.__table__.delete().where(
            WorkspaceQuickLink.id == link_id,
            WorkspaceQuickLink.user_id == user.id,
            WorkspaceQuickLink.version == expected_version,
        )
    )
    if result.rowcount != 1:
        return await _conflict_or_404(session, link_id, user.id)
    await session.commit()
    return Response(status_code=204)
