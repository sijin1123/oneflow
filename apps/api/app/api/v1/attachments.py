"""Project attachment metadata (follow-up collaboration module).

Metadata + external URL only — no binary hosting (see the model docstring).
Member-scoped list/create/delete.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import is_member, require_member
from app.db.session import get_session
from app.models.attachment import Attachment
from app.models.user import User
from app.schemas.attachment import AttachmentCreate, AttachmentList, AttachmentRead

router = APIRouter()


@router.get("/projects/{project_id}/attachments", response_model=AttachmentList)
async def list_attachments(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AttachmentList:
    await require_member(session, project_id, user)
    rows = (
        (
            await session.execute(
                select(Attachment)
                .where(Attachment.project_id == project_id)
                .order_by(Attachment.created_at.desc(), Attachment.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return AttachmentList(items=[AttachmentRead.model_validate(r) for r in rows], total=len(rows))


@router.post("/projects/{project_id}/attachments", response_model=AttachmentRead, status_code=201)
async def create_attachment(
    project_id: uuid.UUID,
    body: AttachmentCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AttachmentRead:
    await require_member(session, project_id, user)
    att = Attachment(
        project_id=project_id,
        filename=body.filename,
        url=body.url,
        content_type=body.content_type,
        size_bytes=body.size_bytes,
        uploaded_by=user.id,
    )
    session.add(att)
    await session.flush()
    await session.commit()
    return AttachmentRead.model_validate(att)


@router.delete("/attachments/{attachment_id}", status_code=204)
async def delete_attachment(
    attachment_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    att = (
        await session.execute(select(Attachment).where(Attachment.id == attachment_id))
    ).scalar_one_or_none()
    # Existence hiding: unknown id or a non-member's project both surface as 404.
    if att is None or not await is_member(session, att.project_id, user.id):
        raise HTTPException(status_code=404, detail="not found")
    await session.delete(att)
    await session.commit()
    return Response(status_code=204)
