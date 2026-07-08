"""Project attachments: external URL metadata AND real uploads (Pass 4 PR-M).

Uploads avoid multipart entirely — the client sends the raw file body with the
filename in the query string, so no framework parser can spool an oversized
request before our own counting sees it.
"""

import re
import unicodedata
import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import is_member, require_active_project, require_member, require_writer
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.attachment import Attachment
from app.models.document import ProjectDocument
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.attachment import AttachmentCreate, AttachmentList, AttachmentRead, StorageRead
from app.services.storage import LocalStorage, storage_key
from app.services.storage_usage import storage_usage, used_bytes

router = APIRouter()

# One advisory lock per transaction (house rule from work_packages.py): quota
# check + insert serialize per project so concurrent uploads cannot overshoot.
UPLOAD_LOCK_CLASSID = 427002

_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")


def _clean_filename(raw: str) -> str:
    name = _CONTROL_RE.sub("", unicodedata.normalize("NFC", raw)).strip()
    return (name or "download")[:255]


def _read(att: Attachment) -> AttachmentRead:
    read = AttachmentRead.model_validate(att)
    read.has_file = att.storage_key is not None
    return read


async def _validate_anchor(
    session: AsyncSession,
    project_id: uuid.UUID,
    work_package_id: uuid.UUID | None,
    document_id: uuid.UUID | None,
) -> None:
    """CREATE-side anchor contract (v23.1 R1-②: strict on write, lenient on
    read): at most one anchor; it must exist in THIS project (missing or
    cross-project → 422). Runs BEFORE any row/blob is created (R1-⑤)."""
    if work_package_id is not None and document_id is not None:
        raise HTTPException(status_code=422, detail="at most one anchor is allowed")
    if work_package_id is not None:
        row = (
            await session.execute(
                select(WorkPackage.id).where(
                    WorkPackage.id == work_package_id, WorkPackage.project_id == project_id
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(
                status_code=422, detail="work package must exist in the same project"
            )
    if document_id is not None:
        row = (
            await session.execute(
                select(ProjectDocument.id).where(
                    ProjectDocument.id == document_id, ProjectDocument.project_id == project_id
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=422, detail="document must exist in the same project")


@router.get("/projects/{project_id}/attachments", response_model=AttachmentList)
async def list_attachments(
    project_id: uuid.UUID,
    work_package_id: uuid.UUID | None = Query(default=None),
    document_id: uuid.UUID | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AttachmentList:
    """Read-side filters are LENIENT (v23.1 R1-②): only a double filter is a
    422; a missing/cross-project anchor id simply matches nothing inside the
    project scope (existence hiding)."""
    await require_member(session, project_id, user)
    if work_package_id is not None and document_id is not None:
        raise HTTPException(status_code=422, detail="at most one anchor filter is allowed")
    stmt = select(Attachment).where(Attachment.project_id == project_id)
    if work_package_id is not None:
        stmt = stmt.where(Attachment.work_package_id == work_package_id)
    if document_id is not None:
        stmt = stmt.where(Attachment.document_id == document_id)
    rows = (
        (await session.execute(stmt.order_by(Attachment.created_at.desc(), Attachment.id.asc())))
        .scalars()
        .all()
    )
    return AttachmentList(items=[_read(r) for r in rows], total=len(rows))


@router.post("/projects/{project_id}/attachments", response_model=AttachmentRead, status_code=201)
async def create_attachment(
    project_id: uuid.UUID,
    body: AttachmentCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AttachmentRead:
    await require_member(session, project_id, user, write=True)
    await _validate_anchor(session, project_id, body.work_package_id, body.document_id)
    att = Attachment(
        project_id=project_id,
        work_package_id=body.work_package_id,
        document_id=body.document_id,
        filename=body.filename,
        url=body.url,
        content_type=body.content_type,
        size_bytes=body.size_bytes,
        uploaded_by=user.id,
    )
    session.add(att)
    await session.flush()
    await session.commit()
    return _read(att)


@router.delete("/attachments/{attachment_id}", status_code=204)
async def delete_attachment(
    attachment_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> Response:
    att = (
        await session.execute(select(Attachment).where(Attachment.id == attachment_id))
    ).scalar_one_or_none()
    # Existence hiding: unknown id or a non-member's project both surface as 404.
    if att is None or not await is_member(session, att.project_id, user.id):
        raise HTTPException(status_code=404, detail="not found")
    await require_writer(session, att.project_id, user.id)
    await require_active_project(session, att.project_id)
    key = att.storage_key
    await session.delete(att)
    await session.commit()
    if key is not None:
        # Best effort after commit — a leftover blob is harmless (and swept by
        # the cleanup follow-up); a deleted blob with a live row would not be.
        # Settings come via Depends: a direct get_settings() call would split-
        # brain against the app's explicit Settings (house review finding #5).
        LocalStorage(settings.storage_dir).delete(key)
    return Response(status_code=204)


@router.post(
    "/projects/{project_id}/attachments/upload",
    response_model=AttachmentRead,
    status_code=201,
)
async def upload_attachment(
    project_id: uuid.UUID,
    request: Request,
    filename: str = Query(min_length=1, max_length=255),
    work_package_id: uuid.UUID | None = Query(default=None),
    document_id: uuid.UUID | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> AttachmentRead:
    """Raw-body upload (PLAN P4-1). Order inside ONE transaction: row flush →
    stream to temp (counted) → atomic replace → commit. A failure before commit
    rolls the row back and removes the temp file; only a failed commit can leave
    an (harmless) orphan blob — a broken row is unrepresentable."""
    await require_member(session, project_id, user, write=True)
    # Anchor contract runs BEFORE any row/blob exists (v23.1 R1-⑤).
    await _validate_anchor(session, project_id, work_package_id, document_id)

    # ① Content-Length pre-check: cheap rejection before reading anything.
    declared = request.headers.get("content-length")
    if declared is None:
        raise HTTPException(status_code=411, detail="Content-Length required")
    if int(declared) > settings.upload_max_bytes:
        raise HTTPException(status_code=413, detail="file exceeds the upload size limit")

    # ② Quota check + insert serialized per project (advisory lock, house rule).
    await session.execute(text("SET LOCAL lock_timeout = '5s'"))
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:classid, hashtext(:pid))").bindparams(
            classid=UPLOAD_LOCK_CLASSID, pid=str(project_id)
        )
    )
    # Shared aggregate (Pass 57): the SAME function feeds the Storage tab.
    used = await used_bytes(session, project_id)
    if used + int(declared) > settings.project_storage_quota_bytes:
        raise HTTPException(status_code=413, detail="project storage quota exceeded")

    att = Attachment(
        id=uuid.uuid4(),
        project_id=project_id,
        work_package_id=work_package_id,
        document_id=document_id,
        filename=_clean_filename(filename),
        content_type=(request.headers.get("content-type") or "application/octet-stream")[:120],
        uploaded_by=user.id,
    )
    att.url = f"oneflow://attachments/{att.id}"
    att.storage_key = storage_key(project_id, att.id)
    session.add(att)
    await session.flush()

    storage = LocalStorage(settings.storage_dir)
    limit = settings.upload_max_bytes

    async def counted():
        # ③ Streaming count is authoritative — the declared header is not trusted.
        seen = 0
        async for chunk in request.stream():
            seen += len(chunk)
            if seen > limit:
                raise HTTPException(status_code=413, detail="file exceeds the upload size limit")
            yield chunk

    try:
        written = await storage.save_stream(att.storage_key, counted())
    except HTTPException:
        await session.rollback()
        raise
    except Exception as exc:  # disk full, IO error — no partial state remains
        await session.rollback()
        raise HTTPException(status_code=500, detail="upload failed") from exc

    att.size_bytes = written
    try:
        await session.commit()
    except Exception:
        storage.delete(att.storage_key)  # keep blob and row consistent
        raise
    return _read(att)


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    att = (
        await session.execute(select(Attachment).where(Attachment.id == attachment_id))
    ).scalar_one_or_none()
    # Existence hiding: unknown id, non-member, and URL-only rows are all 404 —
    # enumerating ids reveals nothing. Reads stay open on archived projects.
    if (
        att is None
        or att.storage_key is None
        or not await is_member(session, att.project_id, user.id)
    ):
        raise HTTPException(status_code=404, detail="not found")
    path = LocalStorage(settings.storage_dir).path(att.storage_key)
    if path is None:  # blob lost or racing delete
        raise HTTPException(status_code=404, detail="not found")
    ascii_fallback = att.filename.encode("ascii", "replace").decode().replace('"', "_")
    disposition = (
        f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(att.filename)}"
    )
    return FileResponse(
        path,
        media_type=att.content_type or "application/octet-stream",
        # NEVER inline: a stored HTML/SVG must not render on our origin.
        headers={"Content-Disposition": disposition},
    )


@router.get("/projects/{project_id}/storage", response_model=StorageRead)
async def project_storage(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    user: User = Depends(get_current_user),
) -> StorageRead:
    """Read-only usage snapshot for the settings Storage tab (Pass 57): one
    self-consistent aggregate; the quota itself is env-owned (editing it is
    an explicit non-goal — restart required, see the env rules)."""
    await require_member(session, project_id, user)
    used, files, links = await storage_usage(session, project_id)
    return StorageRead(
        used_bytes=used,
        quota_bytes=settings.project_storage_quota_bytes,
        attachment_count=files,
        link_count=links,
    )
