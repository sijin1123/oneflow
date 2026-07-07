"""Project documents / wiki pages (follow-up collaboration module).

Member-scoped CRUD. Bodies are sanitized rich-text HTML (same nh3 boundary as
work-package descriptions); edits use the integer-version optimistic-concurrency
contract (§6.2), so a stale editor gets a 409 with the current document.

Nested pages (expansion Pass 9 PR-U): parent changes AND deletes serialize on
the same per-project advisory lock, so a reparent cannot race a parent delete
into a surprising final state (PLAN v9.1 R1-②). Depth contract: root is depth
1, a path holds at most MAX_DOCUMENT_DEPTH documents.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import delete as sa_delete
from sqlalchemy import func, select, text
from sqlalchemy import update as sa_update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import is_member, require_active_project, require_member
from app.db.session import get_session
from app.models.document import MAX_DOCUMENT_DEPTH, DocumentWorkPackageLink, ProjectDocument
from app.models.document_comment import ProjectDocumentComment
from app.models.member import ProjectMember
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.document import (
    DocumentConflict,
    DocumentCreate,
    DocumentLinkCreate,
    DocumentLinkList,
    DocumentLinkRead,
    DocumentList,
    DocumentListItem,
    DocumentRead,
    DocumentUpdate,
)
from app.schemas.document_comment import (
    DocumentCommentCreate,
    DocumentCommentList,
    DocumentCommentRead,
)
from app.services.sanitize import sanitize_html

router = APIRouter()

# Serializes document parent changes and deletes per project (WP parent-move
# 427001 pattern). Exactly one advisory lock per transaction.
DOC_PARENT_LOCK_CLASSID = 427004


async def _lock_project_documents(session: AsyncSession, project_id: uuid.UUID) -> None:
    await session.execute(text("SET LOCAL lock_timeout = '5s'"))
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:classid, hashtext(:pid))").bindparams(
            classid=DOC_PARENT_LOCK_CLASSID, pid=str(project_id)
        )
    )


async def _ancestor_path_len(
    session: AsyncSession, doc_id: uuid.UUID, project_id: uuid.UUID
) -> int:
    """Number of documents from doc_id up to its root, inclusive (root = 1)."""
    count = 0
    seen: set[uuid.UUID] = set()
    cursor: uuid.UUID | None = doc_id
    while cursor is not None and cursor not in seen:
        seen.add(cursor)
        count += 1
        cursor = (
            await session.execute(
                select(ProjectDocument.parent_id).where(
                    ProjectDocument.id == cursor, ProjectDocument.project_id == project_id
                )
            )
        ).scalar_one_or_none()
    return count


async def _subtree_height(session: AsyncSession, doc_id: uuid.UUID, project_id: uuid.UUID) -> int:
    """Height of the subtree rooted at doc_id (the document itself = 1)."""
    row = (
        await session.execute(
            text(
                """
                WITH RECURSIVE sub AS (
                    SELECT id, 1 AS depth FROM project_documents
                    WHERE id = CAST(:doc_id AS uuid) AND project_id = CAST(:pid AS uuid)
                    UNION ALL
                    SELECT d.id, sub.depth + 1 FROM project_documents d
                    JOIN sub ON d.parent_id = sub.id
                    WHERE sub.depth < :cap
                )
                SELECT max(depth) FROM sub
                """
            ).bindparams(doc_id=str(doc_id), pid=str(project_id), cap=MAX_DOCUMENT_DEPTH + 1)
        )
    ).scalar_one_or_none()
    return int(row or 1)


async def _check_parent_guards(
    session: AsyncSession, doc: ProjectDocument, new_parent_id: uuid.UUID
) -> None:
    """Self/cross-project/cycle/depth guards. Caller must hold the project lock."""
    if new_parent_id == doc.id:
        raise HTTPException(status_code=422, detail="document cannot be its own parent")
    parent = (
        await session.execute(select(ProjectDocument).where(ProjectDocument.id == new_parent_id))
    ).scalar_one_or_none()
    if parent is None or parent.project_id != doc.project_id:
        raise HTTPException(status_code=422, detail="parent must exist in the same project")
    # Ancestor walk — same-project (DB-enforced), bounded by project size.
    seen: set[uuid.UUID] = set()
    cursor: uuid.UUID | None = new_parent_id
    while cursor is not None and cursor not in seen:
        if cursor == doc.id:
            raise HTTPException(status_code=422, detail="parent change would create a cycle")
        seen.add(cursor)
        cursor = (
            await session.execute(
                select(ProjectDocument.parent_id).where(ProjectDocument.id == cursor)
            )
        ).scalar_one_or_none()
    if cursor is not None:  # pre-existing cycle encountered defensively
        raise HTTPException(status_code=422, detail="parent chain integrity error")
    # Depth: parent path + the moved subtree must fit MAX_DOCUMENT_DEPTH (root=1).
    parent_depth = await _ancestor_path_len(session, new_parent_id, doc.project_id)
    height = await _subtree_height(session, doc.id, doc.project_id)
    if parent_depth + height > MAX_DOCUMENT_DEPTH:
        raise HTTPException(
            status_code=422,
            detail=f"nesting deeper than {MAX_DOCUMENT_DEPTH} levels is not allowed",
        )


async def _get_doc_scoped(
    session: AsyncSession, doc_id: uuid.UUID, user: User, *, write: bool = False
) -> ProjectDocument:
    doc = (
        await session.execute(select(ProjectDocument).where(ProjectDocument.id == doc_id))
    ).scalar_one_or_none()
    if doc is None or not await is_member(session, doc.project_id, user.id):
        raise HTTPException(status_code=404, detail="not found")
    if write:
        await require_active_project(session, doc.project_id)
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
    await require_member(session, project_id, user, write=True)
    if body.parent_id is not None:
        # Lock so the parent cannot be concurrently deleted between the check
        # and the INSERT (clean 422 instead of an FK IntegrityError 500).
        await _lock_project_documents(session, project_id)
        parent = (
            await session.execute(
                select(ProjectDocument).where(ProjectDocument.id == body.parent_id)
            )
        ).scalar_one_or_none()
        if parent is None or parent.project_id != project_id:
            raise HTTPException(status_code=422, detail="parent must exist in the same project")
        parent_depth = await _ancestor_path_len(session, body.parent_id, project_id)
        if parent_depth + 1 > MAX_DOCUMENT_DEPTH:
            raise HTTPException(
                status_code=422,
                detail=f"nesting deeper than {MAX_DOCUMENT_DEPTH} levels is not allowed",
            )
    doc = ProjectDocument(
        project_id=project_id,
        parent_id=body.parent_id,
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
    doc = await _get_doc_scoped(session, doc_id, user, write=True)

    changes: dict = {}
    provided = body.model_fields_set
    if "title" in provided and body.title is not None:
        changes["title"] = body.title
    if "body" in provided:
        changes["body"] = sanitize_html(body.body)
    if "parent_id" in provided:
        changes["parent_id"] = body.parent_id
        if body.parent_id is not None:
            # Serialize reparent against concurrent moves/deletes, then guard
            # (self/cycle/depth). Moving to root (null) needs no guards.
            await _lock_project_documents(session, doc.project_id)
            await _check_parent_guards(session, doc, body.parent_id)

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
    doc = await _get_doc_scoped(session, doc_id, user, write=True)
    # Same lock as parent changes: a reparent and this delete serialize, so the
    # FK's SET NULL (child root-promotion) applies in a deterministic order.
    await _lock_project_documents(session, doc.project_id)
    await session.delete(doc)
    await session.commit()
    return Response(status_code=204)


@router.get("/documents/{doc_id}/work-package-links", response_model=DocumentLinkList)
async def list_document_links(
    doc_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DocumentLinkList:
    doc = await _get_doc_scoped(session, doc_id, user)
    rows = (
        (
            await session.execute(
                select(DocumentWorkPackageLink)
                .where(
                    DocumentWorkPackageLink.document_id == doc.id,
                    DocumentWorkPackageLink.project_id == doc.project_id,
                )
                .order_by(
                    DocumentWorkPackageLink.created_at.asc(), DocumentWorkPackageLink.id.asc()
                )
            )
        )
        .scalars()
        .all()
    )
    return DocumentLinkList(
        items=[DocumentLinkRead.model_validate(r) for r in rows], total=len(rows)
    )


@router.post(
    "/documents/{doc_id}/work-package-links", response_model=DocumentLinkRead, status_code=201
)
async def create_document_link(
    doc_id: uuid.UUID,
    body: DocumentLinkCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DocumentLinkRead:
    doc = await _get_doc_scoped(session, doc_id, user, write=True)
    # Same-project pre-validation: a WP outside the document's project reads as
    # 404 (existence hiding — the caller may not even be a member there). The
    # composite FK stays as the last line of defense.
    wp = (
        await session.execute(
            select(WorkPackage.id).where(
                WorkPackage.id == body.work_package_id,
                WorkPackage.project_id == doc.project_id,
            )
        )
    ).scalar_one_or_none()
    if wp is None:
        raise HTTPException(status_code=404, detail="not found")
    exists = (
        await session.execute(
            select(DocumentWorkPackageLink.id).where(
                DocumentWorkPackageLink.document_id == doc.id,
                DocumentWorkPackageLink.work_package_id == body.work_package_id,
            )
        )
    ).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status_code=409, detail="link already exists")
    link = DocumentWorkPackageLink(
        project_id=doc.project_id, document_id=doc.id, work_package_id=body.work_package_id
    )
    session.add(link)
    await session.flush()
    await session.commit()
    return DocumentLinkRead.model_validate(link)


@router.delete("/documents/{doc_id}/work-package-links/{link_id}", status_code=204)
async def delete_document_link(
    doc_id: uuid.UUID,
    link_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    doc = await _get_doc_scoped(session, doc_id, user, write=True)
    # Fully scoped delete (R1-①): a link id from another document or project
    # never matches — 404, not a cross-scope delete.
    link = (
        await session.execute(
            select(DocumentWorkPackageLink).where(
                DocumentWorkPackageLink.id == link_id,
                DocumentWorkPackageLink.document_id == doc.id,
                DocumentWorkPackageLink.project_id == doc.project_id,
            )
        )
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="not found")
    await session.delete(link)
    await session.commit()
    return Response(status_code=204)


@router.get("/work-packages/{wp_id}/documents", response_model=DocumentList)
async def list_work_package_documents(
    wp_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DocumentList:
    wp = (
        await session.execute(select(WorkPackage).where(WorkPackage.id == wp_id))
    ).scalar_one_or_none()
    if wp is None or not await is_member(session, wp.project_id, user.id):
        raise HTTPException(status_code=404, detail="not found")
    rows = (
        (
            await session.execute(
                select(ProjectDocument)
                .join(
                    DocumentWorkPackageLink,
                    DocumentWorkPackageLink.document_id == ProjectDocument.id,
                )
                .where(
                    DocumentWorkPackageLink.work_package_id == wp_id,
                    DocumentWorkPackageLink.project_id == wp.project_id,
                )
                .order_by(ProjectDocument.title.asc(), ProjectDocument.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return DocumentList(items=[DocumentListItem.model_validate(r) for r in rows], total=len(rows))


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


# --- Document comments (Pass 43 PR-BI, v43.1) ---------------------------------


@router.get("/documents/{doc_id}/comments", response_model=DocumentCommentList)
async def list_document_comments(
    doc_id: uuid.UUID,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DocumentCommentList:
    """Member-scoped; reads stay open on archived projects. `total` is the
    FULL count (limit/offset — the WP-activities contract; nothing is ever
    unreachable, v43.1 R1-②)."""
    doc = await _get_doc_scoped(session, doc_id, user)
    base = select(ProjectDocumentComment).where(ProjectDocumentComment.document_id == doc.id)
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        (
            await session.execute(
                base.order_by(
                    ProjectDocumentComment.created_at.asc(), ProjectDocumentComment.id.asc()
                )
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return DocumentCommentList(
        items=[DocumentCommentRead.model_validate(r) for r in rows], total=total
    )


@router.post("/documents/{doc_id}/comments", response_model=DocumentCommentRead, status_code=201)
async def create_document_comment(
    doc_id: uuid.UUID,
    body: DocumentCommentCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DocumentCommentRead:
    doc = await _get_doc_scoped(session, doc_id, user, write=True)
    comment = ProjectDocumentComment(
        document_id=doc.id, project_id=doc.project_id, author_id=user.id, body=body.body
    )
    try:
        session.add(comment)
        await session.flush()
        await session.commit()
    except IntegrityError as exc:
        # The document vanished between the scope check and the INSERT — the
        # same 404 the check would have produced (v43.1 R1-③).
        await session.rollback()
        raise HTTPException(status_code=404, detail="not found") from exc
    return DocumentCommentRead.model_validate(comment)


@router.delete("/document-comments/{comment_id}", status_code=204)
async def delete_document_comment(
    comment_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    """Author or PROJECT OWNER (v43.1 R1-④ — the owner is the cleanup
    authority, incl. author-less SET NULL rows). Order: scope 404 → archive
    409 → authorship 404; the conditional DELETE maps rowcount 0 to 404."""
    comment = (
        await session.execute(
            select(ProjectDocumentComment).where(ProjectDocumentComment.id == comment_id)
        )
    ).scalar_one_or_none()
    if comment is None or not await is_member(session, comment.project_id, user.id):
        raise HTTPException(status_code=404, detail="not found")
    await require_active_project(session, comment.project_id)
    if comment.author_id != user.id:
        role = (
            await session.execute(
                select(ProjectMember.role).where(
                    ProjectMember.project_id == comment.project_id,
                    ProjectMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if role != "owner":
            raise HTTPException(status_code=404, detail="not found")  # existence hidden
    result = await session.execute(
        sa_delete(ProjectDocumentComment).where(ProjectDocumentComment.id == comment_id)
    )
    await session.commit()
    if (result.rowcount or 0) == 0:
        raise HTTPException(status_code=404, detail="not found")  # deleted mid-flight
    return Response(status_code=204)
