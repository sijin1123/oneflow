"""Project documents / wiki pages (follow-up collaboration module).

Member-scoped CRUD. Bodies are sanitized rich-text HTML (same nh3 boundary as
work-package descriptions); edits use the integer-version optimistic-concurrency
contract (§6.2), so a stale editor gets a 409 with the current document.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import is_member, require_member
from app.db.session import get_session
from app.models.document import ProjectDocument
from app.models.user import User
from app.schemas.document import (
    DocumentConflict,
    DocumentCreate,
    DocumentList,
    DocumentListItem,
    DocumentRead,
    DocumentUpdate,
)
from app.services.sanitize import sanitize_html

router = APIRouter()


async def _get_doc_scoped(session: AsyncSession, doc_id: uuid.UUID, user: User) -> ProjectDocument:
    doc = (
        await session.execute(select(ProjectDocument).where(ProjectDocument.id == doc_id))
    ).scalar_one_or_none()
    if doc is None or not await is_member(session, doc.project_id, user.id):
        raise HTTPException(status_code=404, detail="not found")
    return doc


@router.get("/projects/{project_id}/documents", response_model=DocumentList)
async def list_documents(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DocumentList:
    await require_member(session, project_id, user)
    rows = (
        (
            await session.execute(
                select(ProjectDocument)
                .where(ProjectDocument.project_id == project_id)
                .order_by(ProjectDocument.updated_at.desc(), ProjectDocument.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return DocumentList(items=[DocumentListItem.model_validate(r) for r in rows], total=len(rows))


@router.post("/projects/{project_id}/documents", response_model=DocumentRead, status_code=201)
async def create_document(
    project_id: uuid.UUID,
    body: DocumentCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DocumentRead:
    await require_member(session, project_id, user)
    doc = ProjectDocument(
        project_id=project_id,
        title=body.title,
        body=sanitize_html(body.body),
        author_id=user.id,
    )
    session.add(doc)
    await session.flush()
    await session.commit()
    return DocumentRead.model_validate(doc)


@router.get("/documents/{doc_id}", response_model=DocumentRead)
async def get_document(
    doc_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DocumentRead:
    return DocumentRead.model_validate(await _get_doc_scoped(session, doc_id, user))


@router.patch(
    "/documents/{doc_id}",
    response_model=DocumentRead,
    responses={409: {"model": DocumentConflict}},
)
async def update_document(
    doc_id: uuid.UUID,
    body: DocumentUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    await _get_doc_scoped(session, doc_id, user)

    changes: dict = {}
    provided = body.model_fields_set
    if "title" in provided and body.title is not None:
        changes["title"] = body.title
    if "body" in provided:
        changes["body"] = sanitize_html(body.body)

    if not changes:
        fresh = await _reselect(session, doc_id)
        if fresh is None:
            raise HTTPException(status_code=404, detail="not found")
        if fresh.version != body.expected_version:
            return _conflict(fresh)
        return DocumentRead.model_validate(fresh)

    stmt = (
        sa_update(ProjectDocument)
        .where(
            ProjectDocument.id == doc_id,
            ProjectDocument.version == body.expected_version,
        )
        .values(**changes, version=ProjectDocument.version + 1, updated_at=func.now())
        .returning(ProjectDocument)
        .execution_options(synchronize_session=False, populate_existing=True)
    )
    updated = (await session.execute(stmt)).scalar_one_or_none()
    await session.commit()
    if updated is not None:
        return DocumentRead.model_validate(updated)

    fresh = await _reselect(session, doc_id)
    if fresh is None:
        raise HTTPException(status_code=404, detail="not found")
    return _conflict(fresh)


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_document(
    doc_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    doc = await _get_doc_scoped(session, doc_id, user)
    await session.delete(doc)
    await session.commit()
    return Response(status_code=204)


async def _reselect(session: AsyncSession, doc_id: uuid.UUID) -> ProjectDocument | None:
    return (
        await session.execute(
            select(ProjectDocument)
            .where(ProjectDocument.id == doc_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()


def _conflict(current: ProjectDocument) -> JSONResponse:
    payload = DocumentConflict(
        detail="version conflict — document was modified by someone else",
        current=DocumentRead.model_validate(current),
    )
    return JSONResponse(status_code=409, content=jsonable_encoder(payload))
