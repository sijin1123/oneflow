"""Owner-only work-item drafts for the project creation composer."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.work_packages import (
    _schedule_webhook,
    _work_package_read,
    stage_work_package_create,
)
from app.core.auth import get_current_user
from app.core.authz import require_member
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.member import ProjectMember
from app.models.user import User
from app.models.work_item_draft import WorkItemDraft
from app.models.work_package import WorkPackage
from app.schemas.work_item_draft import (
    WorkItemDraftConflict,
    WorkItemDraftCreate,
    WorkItemDraftError,
    WorkItemDraftList,
    WorkItemDraftRead,
    WorkItemDraftReplace,
    WorkItemDraftSubmit,
)
from app.schemas.work_package import WorkPackageCreate, WorkPackageRead
from app.services.workspace_features import CUSTOMERS_FEATURE, RELEASES_FEATURE, feature_enabled

router = APIRouter()

ACTIVE_DRAFT_LIMIT = 20
DRAFT_LOCK_CLASSID = 427013


def _read(draft: WorkItemDraft) -> WorkItemDraftRead:
    return WorkItemDraftRead.model_validate(draft)


async def _lock_owner_drafts(session: AsyncSession, owner_id: uuid.UUID) -> None:
    try:
        await session.execute(text("SET LOCAL lock_timeout = '5s'"))
        await session.execute(
            text("SELECT pg_advisory_xact_lock(:classid, hashtext(:uid))").bindparams(
                classid=DRAFT_LOCK_CLASSID, uid=str(owner_id)
            )
        )
    except DBAPIError as exc:
        await session.rollback()
        if getattr(exc.orig, "sqlstate", None) == "55P03":
            raise HTTPException(
                status_code=503, detail="work item drafts busy - retry shortly"
            ) from exc
        raise


async def _owned_active_or_404(
    session: AsyncSession,
    draft_id: uuid.UUID,
    owner_id: uuid.UUID,
    *,
    refresh: bool = False,
) -> WorkItemDraft:
    statement = select(WorkItemDraft).where(
        WorkItemDraft.id == draft_id,
        WorkItemDraft.owner_id == owner_id,
        WorkItemDraft.submitted_at.is_(None),
    )
    if refresh:
        statement = statement.execution_options(populate_existing=True)
    draft = (await session.execute(statement)).scalar_one_or_none()
    if draft is None:
        raise HTTPException(status_code=404, detail="not found")
    return draft


async def _owned_or_404_for_update(
    session: AsyncSession, draft_id: uuid.UUID, owner_id: uuid.UUID
) -> WorkItemDraft:
    draft = (
        await session.execute(
            select(WorkItemDraft)
            .where(WorkItemDraft.id == draft_id, WorkItemDraft.owner_id == owner_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if draft is None:
        raise HTTPException(status_code=404, detail="not found")
    return draft


async def _conflict_or_404(
    session: AsyncSession, draft_id: uuid.UUID, owner_id: uuid.UUID
) -> JSONResponse:
    current = await _owned_active_or_404(session, draft_id, owner_id, refresh=True)
    payload = WorkItemDraftConflict(current=_read(current))
    return JSONResponse(status_code=409, content=jsonable_encoder(payload))


@router.get("/me/work-item-drafts", response_model=WorkItemDraftList)
async def list_work_item_drafts(
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkItemDraftList:
    statement = (
        select(WorkItemDraft)
        .join(
            ProjectMember,
            (ProjectMember.project_id == WorkItemDraft.project_id)
            & (ProjectMember.user_id == user.id),
        )
        .where(
            WorkItemDraft.owner_id == user.id,
            WorkItemDraft.submitted_at.is_(None),
        )
    )
    total = (
        await session.execute(select(func.count()).select_from(statement.subquery()))
    ).scalar_one()
    drafts = (
        (
            await session.execute(
                statement.order_by(WorkItemDraft.updated_at.desc(), WorkItemDraft.id.asc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return WorkItemDraftList(
        items=[_read(draft) for draft in drafts], total=total, limit=limit, offset=offset
    )


@router.post(
    "/projects/{project_id}/work-item-drafts",
    response_model=WorkItemDraftRead,
    status_code=201,
    responses={409: {"model": WorkItemDraftError}, 503: {"model": WorkItemDraftError}},
)
async def create_work_item_draft(
    project_id: uuid.UUID,
    body: WorkItemDraftCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkItemDraftRead:
    await require_member(session, project_id, user, write=True)
    await _lock_owner_drafts(session, user.id)
    count = (
        await session.execute(
            select(func.count()).where(
                WorkItemDraft.owner_id == user.id,
                WorkItemDraft.submitted_at.is_(None),
            )
        )
    ).scalar_one()
    if count >= ACTIVE_DRAFT_LIMIT:
        raise HTTPException(status_code=409, detail="work item draft limit (20) reached")
    draft = WorkItemDraft(
        owner_id=user.id,
        project_id=project_id,
        content=body.content.model_dump(mode="json"),
    )
    session.add(draft)
    await session.flush()
    await session.commit()
    return _read(draft)


@router.get("/work-item-drafts/{draft_id}", response_model=WorkItemDraftRead)
async def get_work_item_draft(
    draft_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkItemDraftRead:
    draft = await _owned_active_or_404(session, draft_id, user.id)
    await require_member(session, draft.project_id, user)
    return _read(draft)


@router.put(
    "/work-item-drafts/{draft_id}",
    response_model=WorkItemDraftRead,
    responses={409: {"model": WorkItemDraftConflict}},
)
async def replace_work_item_draft(
    draft_id: uuid.UUID,
    body: WorkItemDraftReplace,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkItemDraftRead | JSONResponse:
    current = await _owned_active_or_404(session, draft_id, user.id)
    await require_member(session, current.project_id, user, write=True)
    result = await session.execute(
        update(WorkItemDraft)
        .where(
            WorkItemDraft.id == draft_id,
            WorkItemDraft.owner_id == user.id,
            WorkItemDraft.submitted_at.is_(None),
            WorkItemDraft.version == body.expected_version,
        )
        .values(
            content=body.content.model_dump(mode="json"),
            version=WorkItemDraft.version + 1,
            updated_at=func.now(),
        )
        .returning(WorkItemDraft)
    )
    draft = result.scalar_one_or_none()
    if draft is None:
        return await _conflict_or_404(session, draft_id, user.id)
    await session.commit()
    return _read(draft)


@router.post(
    "/work-item-drafts/{draft_id}/submit",
    response_model=WorkPackageRead,
    responses={409: {"model": WorkItemDraftConflict}},
)
async def submit_work_item_draft(
    draft_id: uuid.UUID,
    body: WorkItemDraftSubmit,
    background_tasks: BackgroundTasks,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> WorkPackageRead | JSONResponse:
    draft = await _owned_or_404_for_update(session, draft_id, user.id)
    await require_member(session, draft.project_id, user, write=True)

    # A retry after a successful response returns the same work package and
    # never repeats activities, notifications, or webhook enqueueing.
    if draft.submitted_at is not None:
        work_package = (
            await session.execute(
                select(WorkPackage).where(
                    WorkPackage.id == draft.submitted_work_package_id,
                    WorkPackage.project_id == draft.project_id,
                )
            )
        ).scalar_one_or_none()
        if work_package is None:
            raise HTTPException(status_code=409, detail="draft was already submitted")
        return _work_package_read(
            work_package,
            releases_enabled=await feature_enabled(session, RELEASES_FEATURE),
            customers_enabled=await feature_enabled(session, CUSTOMERS_FEATURE),
        )

    if draft.version != body.expected_version:
        return await _conflict_or_404(session, draft_id, user.id)
    try:
        create_body = WorkPackageCreate(**draft.content)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=jsonable_encoder(exc.errors(include_context=False)),
        ) from exc

    work_package, webhook_event_id = await stage_work_package_create(
        session, draft.project_id, create_body, user, settings
    )
    draft.submitted_work_package_id = work_package.id
    draft.submitted_at = datetime.now(UTC)
    draft.updated_at = datetime.now(UTC)
    draft.version += 1
    await session.flush()
    await session.commit()
    _schedule_webhook(background_tasks, request, webhook_event_id)
    return _work_package_read(
        work_package,
        releases_enabled=await feature_enabled(session, RELEASES_FEATURE),
        customers_enabled=await feature_enabled(session, CUSTOMERS_FEATURE),
    )


@router.delete(
    "/work-item-drafts/{draft_id}",
    status_code=204,
    response_model=None,
    responses={409: {"model": WorkItemDraftConflict}},
)
async def delete_work_item_draft(
    draft_id: uuid.UUID,
    expected_version: int = Query(ge=0, le=2_147_483_647),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response | JSONResponse:
    await _owned_active_or_404(session, draft_id, user.id)
    result = await session.execute(
        WorkItemDraft.__table__.delete().where(
            WorkItemDraft.id == draft_id,
            WorkItemDraft.owner_id == user.id,
            WorkItemDraft.submitted_at.is_(None),
            WorkItemDraft.version == expected_version,
        )
    )
    if result.rowcount != 1:
        return await _conflict_or_404(session, draft_id, user.id)
    await session.commit()
    return Response(status_code=204)
