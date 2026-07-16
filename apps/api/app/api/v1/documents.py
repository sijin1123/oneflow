"""Project documents / wiki pages (follow-up collaboration module).

Member-scoped CRUD. Bodies are sanitized rich-text HTML (same nh3 boundary as
work-package descriptions); edits use the integer-version optimistic-concurrency
contract (§6.2), so a stale editor gets a 409 with the current document.

Nested pages (expansion Pass 9 PR-U): parent changes AND deletes serialize on
the same per-project advisory lock, so a reparent cannot race a parent delete
into a surprising final state (PLAN v9.1 R1-②). Depth contract: root is depth
1, a path holds at most MAX_DOCUMENT_DEPTH documents.
"""

import re
import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import delete as sa_delete
from sqlalchemy import func, select, text
from sqlalchemy import update as sa_update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.attachments import INLINE_IMAGE_TYPES
from app.core.auth import get_current_user
from app.core.authz import is_member, require_active_project, require_member, require_writer
from app.db.session import get_session
from app.models.attachment import Attachment
from app.models.comment import LEGACY_REACTION_KEYS
from app.models.document import MAX_DOCUMENT_DEPTH, DocumentWorkPackageLink, ProjectDocument
from app.models.document_comment import (
    ProjectDocumentComment,
    ProjectDocumentCommentReaction,
)
from app.models.member import ProjectMember
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.comment import ReactionAgg, ReactionList
from app.schemas.document import (
    DocumentConflict,
    DocumentCreate,
    DocumentLifecycleRequest,
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
    InlineDocumentCommentCreate,
    InlineDocumentCommentResult,
)
from app.services.document_access import document_is_visible, document_visible_clause
from app.services.emoji import is_single_emoji, normalize_emoji
from app.services.notification import notify_document_mentions
from app.services.sanitize import (
    document_comment_anchor_quote,
    normalize_anchor_quote,
    sanitize_document_html,
)
from app.services.workspace_features import require_feature_enabled


async def _require_wiki_enabled(session: AsyncSession = Depends(get_session)) -> None:
    await require_feature_enabled(session)


router = APIRouter(dependencies=[Depends(_require_wiki_enabled)])

# Serializes document parent changes and deletes per project (WP parent-move
# 427001 pattern). Exactly one advisory lock per transaction.
DOC_PARENT_LOCK_CLASSID = 427004


def _normalize_document_comment_reaction(emoji: str) -> str:
    if emoji in LEGACY_REACTION_KEYS:
        return LEGACY_REACTION_KEYS[emoji]
    normalized = normalize_emoji(emoji)
    if not is_single_emoji(normalized):
        raise HTTPException(status_code=422, detail="emoji must be a single emoji character")
    return normalized


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
    session: AsyncSession, doc: ProjectDocument, new_parent_id: uuid.UUID, user: User
) -> None:
    """Self/cross-project/cycle/depth guards. Caller must hold the project lock."""
    if new_parent_id == doc.id:
        raise HTTPException(status_code=422, detail="document cannot be its own parent")
    parent = (
        await session.execute(select(ProjectDocument).where(ProjectDocument.id == new_parent_id))
    ).scalar_one_or_none()
    if (
        parent is None
        or parent.project_id != doc.project_id
        or parent.archived_at is not None
        or not document_is_visible(parent, user.id)
        or parent.visibility != doc.visibility
    ):
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
    session: AsyncSession,
    doc_id: uuid.UUID,
    user: User,
    *,
    write: bool = False,
    lifecycle: bool = False,
) -> ProjectDocument:
    doc = (
        await session.execute(select(ProjectDocument).where(ProjectDocument.id == doc_id))
    ).scalar_one_or_none()
    if (
        doc is None
        or not await is_member(session, doc.project_id, user.id)
        or not document_is_visible(doc, user.id)
    ):
        raise HTTPException(status_code=404, detail="not found")
    if write:
        await require_writer(session, doc.project_id, user.id)
        await require_active_project(session, doc.project_id)
        if doc.archived_at is not None and not lifecycle:
            raise HTTPException(status_code=409, detail="archived document is read-only")
    return doc


@router.get("/projects/{project_id}/documents", response_model=DocumentList)
async def list_documents(
    project_id: uuid.UUID,
    bucket: Literal["shared", "private", "archived"] = Query(default="shared"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DocumentList:
    await require_member(session, project_id, user)
    stmt = select(ProjectDocument).where(ProjectDocument.project_id == project_id)
    if bucket == "shared":
        stmt = stmt.where(
            ProjectDocument.visibility == "shared", ProjectDocument.archived_at.is_(None)
        )
    elif bucket == "private":
        stmt = stmt.where(
            ProjectDocument.visibility == "private",
            ProjectDocument.author_id == user.id,
            ProjectDocument.archived_at.is_(None),
        )
    else:
        stmt = stmt.where(
            ProjectDocument.archived_at.is_not(None), document_visible_clause(user.id)
        )
    rows = (
        (
            await session.execute(
                stmt.order_by(ProjectDocument.updated_at.desc(), ProjectDocument.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return DocumentList(items=[DocumentListItem.model_validate(r) for r in rows], total=len(rows))


@router.get("/documents", response_model=DocumentList)
async def list_workspace_documents(
    bucket: Literal["shared", "private", "archived"] = Query(default="shared"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DocumentList:
    """List visible Wiki pages across projects the caller currently belongs to."""
    stmt = (
        select(ProjectDocument)
        .join(ProjectMember, ProjectMember.project_id == ProjectDocument.project_id)
        .where(ProjectMember.user_id == user.id)
    )
    if bucket == "shared":
        stmt = stmt.where(
            ProjectDocument.visibility == "shared", ProjectDocument.archived_at.is_(None)
        )
    elif bucket == "private":
        stmt = stmt.where(
            ProjectDocument.visibility == "private",
            ProjectDocument.author_id == user.id,
            ProjectDocument.archived_at.is_(None),
        )
    else:
        stmt = stmt.where(
            ProjectDocument.archived_at.is_not(None), document_visible_clause(user.id)
        )
    rows = (
        (
            await session.execute(
                stmt.order_by(ProjectDocument.updated_at.desc(), ProjectDocument.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return DocumentList(
        items=[DocumentListItem.model_validate(row) for row in rows], total=len(rows)
    )


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
        if (
            parent is None
            or parent.project_id != project_id
            or parent.archived_at is not None
            or not document_is_visible(parent, user.id)
            or parent.visibility != body.visibility
        ):
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
        # CREATE cannot own inline images yet (v68.1 R1-①) — imgs drop here.
        body=await _validate_inline_images(
            session, project_id, None, sanitize_document_html(body.body)
        ),
        author_id=user.id,
        visibility=body.visibility,
    )
    session.add(doc)
    await session.flush()
    await session.commit()
    return DocumentRead.model_validate(doc)


# Inline images (Pass 68, v68.1 R1-①): only THIS document's own raster-image
# attachments may appear as <img> — anything else (cross-project, another
# document, deleted, non-image, malformed) drops the WHOLE tag. CREATE has no
# document id yet, so document_id=None drops every img (insertion happens by
# editing an existing document).
_IMG_TAG_RE = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
_IMG_SRC_RE = re.compile(
    r'src="/api/v1/attachments/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-'
    r'[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/download"'
)


async def _validate_inline_images(
    session: AsyncSession,
    project_id: uuid.UUID,
    document_id: uuid.UUID | None,
    html: str | None,
) -> str | None:
    if not html or "<img" not in html.lower():
        return html
    tags = _IMG_TAG_RE.findall(html)
    ids: set[uuid.UUID] = set()
    for tag in tags:
        m = _IMG_SRC_RE.search(tag)
        if m:
            ids.add(uuid.UUID(m.group(1)))
    allowed: set[uuid.UUID] = set()
    if ids and document_id is not None:
        allowed = set(
            (
                await session.execute(
                    select(Attachment.id).where(
                        Attachment.id.in_(ids),
                        Attachment.project_id == project_id,
                        Attachment.document_id == document_id,
                        Attachment.content_type.in_(INLINE_IMAGE_TYPES),
                        Attachment.storage_key.is_not(None),
                    )
                )
            ).scalars()
        )

    def _keep(match: re.Match) -> str:
        tag = match.group(0)
        m = _IMG_SRC_RE.search(tag)
        if m and uuid.UUID(m.group(1)) in allowed:
            return tag
        return ""  # deterministic drop — no src-less img survives (R1-⑥)

    return _IMG_TAG_RE.sub(_keep, html)


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
        changes["body"] = await _validate_inline_images(
            session, doc.project_id, doc.id, sanitize_document_html(body.body)
        )
    if "parent_id" in provided:
        changes["parent_id"] = body.parent_id
        if body.parent_id is not None:
            # Serialize reparent against concurrent moves/deletes, then guard
            # (self/cycle/depth). Moving to root (null) needs no guards.
            await _lock_project_documents(session, doc.project_id)
            await _check_parent_guards(session, doc, body.parent_id, user)
    if "visibility" in provided and body.visibility is not None:
        if doc.author_id != user.id:
            raise HTTPException(status_code=404, detail="not found")
        mismatched_child = (
            await session.execute(
                select(ProjectDocument.id)
                .where(
                    ProjectDocument.parent_id == doc.id,
                    ProjectDocument.visibility != body.visibility,
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if mismatched_child is not None:
            raise HTTPException(
                status_code=422,
                detail="parent and child documents must use the same visibility",
            )
        if doc.parent_id is not None:
            parent_visibility = await session.scalar(
                select(ProjectDocument.visibility).where(ProjectDocument.id == doc.parent_id)
            )
            if parent_visibility != body.visibility:
                raise HTTPException(
                    status_code=422,
                    detail="parent and child documents must use the same visibility",
                )
        changes["visibility"] = body.visibility

    if not changes:
        fresh = await _reselect(session, doc_id)
        if fresh is None or not document_is_visible(fresh, user.id):
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
    if fresh is None or not document_is_visible(fresh, user.id):
        raise HTTPException(status_code=404, detail="not found")
    return _conflict(fresh)


async def _set_archive_state(
    session: AsyncSession,
    doc: ProjectDocument,
    user: User,
    body: DocumentLifecycleRequest,
    *,
    archived: bool,
):
    if archived == (doc.archived_at is not None):
        if doc.version != body.expected_version:
            return _conflict(doc)
        return DocumentRead.model_validate(doc)
    values = (
        {
            "archived_at": datetime.now(UTC),
            "archived_by_user_id": user.id,
            "archived_by_name": user.display_name,
        }
        if archived
        else {
            "archived_at": None,
            "archived_by_user_id": None,
            "archived_by_name": None,
        }
    )
    updated = (
        await session.execute(
            sa_update(ProjectDocument)
            .where(
                ProjectDocument.id == doc.id,
                ProjectDocument.version == body.expected_version,
            )
            .values(**values, version=ProjectDocument.version + 1, updated_at=func.now())
            .returning(ProjectDocument)
            .execution_options(synchronize_session=False, populate_existing=True)
        )
    ).scalar_one_or_none()
    await session.commit()
    if updated is not None:
        return DocumentRead.model_validate(updated)
    fresh = await _reselect(session, doc.id)
    if fresh is None or not document_is_visible(fresh, user.id):
        raise HTTPException(status_code=404, detail="not found")
    return _conflict(fresh)


async def _require_lifecycle_actor(
    session: AsyncSession, document: ProjectDocument, user: User
) -> None:
    if document.author_id == user.id:
        return
    role = await session.scalar(
        select(ProjectMember.role).where(
            ProjectMember.project_id == document.project_id,
            ProjectMember.user_id == user.id,
        )
    )
    if role != "owner":
        raise HTTPException(status_code=404, detail="not found")


@router.post(
    "/documents/{doc_id}/archive",
    response_model=DocumentRead,
    responses={409: {"model": DocumentConflict}},
)
async def archive_document(
    doc_id: uuid.UUID,
    body: DocumentLifecycleRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    doc = await _get_doc_scoped(session, doc_id, user, write=True, lifecycle=True)
    await _require_lifecycle_actor(session, doc, user)
    return await _set_archive_state(session, doc, user, body, archived=True)


@router.post(
    "/documents/{doc_id}/restore",
    response_model=DocumentRead,
    responses={409: {"model": DocumentConflict}},
)
async def restore_document(
    doc_id: uuid.UUID,
    body: DocumentLifecycleRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    doc = await _get_doc_scoped(session, doc_id, user, write=True, lifecycle=True)
    await _require_lifecycle_actor(session, doc, user)
    return await _set_archive_state(session, doc, user, body, archived=False)


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
                    ProjectDocument.archived_at.is_(None),
                    document_visible_clause(user.id),
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
    items = [DocumentCommentRead.model_validate(r) for r in rows]
    reactions = await _document_comment_reaction_aggregates(
        session, [comment.id for comment in rows], user.id
    )
    for item in items:
        item.reactions = reactions[item.id]
    return DocumentCommentList(items=items, total=total)


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
        accepted = await notify_document_mentions(
            session,
            document_id=doc.id,
            project_id=doc.project_id,
            actor_id=user.id,
            candidate_ids=body.mentioned_user_ids,
        )
        comment.mentions = [str(user_id) for user_id in accepted] or None
        await session.flush()
        await session.commit()
    except IntegrityError as exc:
        # The document vanished between the scope check and the INSERT — the
        # same 404 the check would have produced (v43.1 R1-③).
        await session.rollback()
        raise HTTPException(status_code=404, detail="not found") from exc
    return DocumentCommentRead.model_validate(comment)


@router.post(
    "/documents/{doc_id}/inline-comments",
    response_model=InlineDocumentCommentResult,
    status_code=201,
    responses={409: {"model": DocumentConflict}},
)
async def create_inline_document_comment(
    doc_id: uuid.UUID,
    body: InlineDocumentCommentCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Atomically persist a sanitized body anchor and its next thread message.

    The first message normally changes the document body by adding the inert
    span marker; replies submit the unchanged body and therefore do not bump
    the document version. Either way, stale versions create neither half.
    """
    await _get_doc_scoped(session, doc_id, user, write=True)
    doc = (
        await session.execute(
            select(ProjectDocument).where(ProjectDocument.id == doc_id).with_for_update()
        )
    ).scalar_one_or_none()
    if doc is None or not document_is_visible(doc, user.id):
        raise HTTPException(status_code=404, detail="not found")
    if body.expected_document_version is not None:
        if doc.version != body.expected_document_version:
            return _conflict(doc)
        sanitized = await _validate_inline_images(
            session,
            doc.project_id,
            doc.id,
            sanitize_document_html(body.document_body),
        )
        sanitized = sanitized or ""
    else:
        sanitized = doc.body or ""
    actual_quote = document_comment_anchor_quote(sanitized, body.anchor_id)
    if actual_quote is None or actual_quote != normalize_anchor_quote(body.anchor_quote):
        raise HTTPException(
            status_code=422,
            detail="comment anchor must exist in the submitted document body and match its quote",
        )

    existing_quote = await session.scalar(
        select(ProjectDocumentComment.anchor_quote)
        .where(
            ProjectDocumentComment.document_id == doc.id,
            ProjectDocumentComment.anchor_id == body.anchor_id,
        )
        .limit(1)
    )
    if existing_quote is not None and existing_quote != body.anchor_quote:
        raise HTTPException(
            status_code=422,
            detail="comment anchor quote does not match its thread",
        )

    if body.document_body is not None and sanitized != (doc.body or ""):
        doc.body = sanitized or None
        doc.version += 1
        doc.updated_at = datetime.now(UTC)

    comment = ProjectDocumentComment(
        document_id=doc.id,
        project_id=doc.project_id,
        author_id=user.id,
        body=body.body,
        anchor_id=body.anchor_id,
        anchor_quote=body.anchor_quote,
    )
    try:
        session.add(comment)
        await session.flush()
        accepted = await notify_document_mentions(
            session,
            document_id=doc.id,
            project_id=doc.project_id,
            actor_id=user.id,
            candidate_ids=body.mentioned_user_ids,
        )
        comment.mentions = [str(user_id) for user_id in accepted] or None
        await session.flush()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=404, detail="not found") from exc

    return InlineDocumentCommentResult(
        comment=DocumentCommentRead.model_validate(comment),
        document=DocumentRead.model_validate(doc),
    )


async def _document_comment_reaction_aggregates(
    session: AsyncSession,
    comment_ids: list[uuid.UUID],
    user_id: uuid.UUID,
) -> dict[uuid.UUID, list[ReactionAgg]]:
    aggregates: dict[uuid.UUID, list[ReactionAgg]] = {comment_id: [] for comment_id in comment_ids}
    if not comment_ids:
        return aggregates
    rows = (
        await session.execute(
            select(
                ProjectDocumentCommentReaction.comment_id,
                ProjectDocumentCommentReaction.emoji,
                func.count().label("count"),
                func.bool_or(ProjectDocumentCommentReaction.user_id == user_id).label("me"),
            )
            .where(ProjectDocumentCommentReaction.comment_id.in_(comment_ids))
            .group_by(
                ProjectDocumentCommentReaction.comment_id,
                ProjectDocumentCommentReaction.emoji,
            )
        )
    ).all()
    for comment_id, emoji, count, me in rows:
        aggregates[comment_id].append(ReactionAgg(key=emoji, count=count, me=bool(me)))
    for items in aggregates.values():
        items.sort(key=lambda item: (-item.count, item.key))
    return aggregates


async def _get_document_comment_scoped(
    session: AsyncSession,
    comment_id: uuid.UUID,
    user: User,
    *,
    write: bool = False,
) -> ProjectDocumentComment:
    comment = (
        await session.execute(
            select(ProjectDocumentComment).where(ProjectDocumentComment.id == comment_id)
        )
    ).scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=404, detail="not found")
    await _get_doc_scoped(session, comment.document_id, user, write=write)
    return comment


@router.put(
    "/document-comments/{comment_id}/reactions/{emoji}",
    response_model=ReactionList,
)
async def put_document_comment_reaction(
    comment_id: uuid.UUID,
    emoji: str = Path(min_length=1, max_length=64),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ReactionList:
    emoji = _normalize_document_comment_reaction(emoji)
    comment = await _get_document_comment_scoped(session, comment_id, user, write=True)
    try:
        await session.execute(
            pg_insert(ProjectDocumentCommentReaction)
            .values(id=uuid.uuid4(), comment_id=comment.id, user_id=user.id, emoji=emoji)
            .on_conflict_do_nothing(constraint="uq_document_comment_reactions_comment_user_emoji")
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=404, detail="not found") from exc
    aggregates = await _document_comment_reaction_aggregates(session, [comment.id], user.id)
    return ReactionList(items=aggregates[comment.id])


@router.delete(
    "/document-comments/{comment_id}/reactions/{emoji}",
    response_model=ReactionList,
)
async def delete_document_comment_reaction(
    comment_id: uuid.UUID,
    emoji: str = Path(min_length=1, max_length=64),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ReactionList:
    emoji = _normalize_document_comment_reaction(emoji)
    comment = await _get_document_comment_scoped(session, comment_id, user, write=True)
    await session.execute(
        sa_delete(ProjectDocumentCommentReaction).where(
            ProjectDocumentCommentReaction.comment_id == comment.id,
            ProjectDocumentCommentReaction.user_id == user.id,
            ProjectDocumentCommentReaction.emoji == emoji,
        )
    )
    await session.commit()
    aggregates = await _document_comment_reaction_aggregates(session, [comment.id], user.id)
    return ReactionList(items=aggregates[comment.id])


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
    await _get_doc_scoped(session, comment.document_id, user, write=True)
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
