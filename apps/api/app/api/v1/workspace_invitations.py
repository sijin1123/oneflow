"""Single-workspace member invitation lifecycle (UI-133).

The bearer secret is returned only at create/rotate time. PostgreSQL stores
its SHA-256 digest, and acceptance locks the invitation row so only one
request can activate the account.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_session
from app.models.user import User
from app.models.workspace_invitation import WorkspaceInvitation
from app.schemas.workspace_invitation import (
    InvitationStatus,
    WorkspaceInvitationAccepted,
    WorkspaceInvitationCreate,
    WorkspaceInvitationList,
    WorkspaceInvitationMutation,
    WorkspaceInvitationPreview,
    WorkspaceInvitationRead,
    WorkspaceInvitationSecret,
    WorkspaceInvitationToken,
)

router = APIRouter()
INVITATION_TTL_DAYS = 7
WORKSPACE_INVITATION_LOCK_CLASSID = 427021


def _require_admin(user: User) -> None:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="workspace admin required")


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _new_token() -> str:
    return secrets.token_urlsafe(32)


def _status(row: WorkspaceInvitation, now: datetime | None = None) -> InvitationStatus:
    if row.accepted_at is not None:
        return "accepted"
    if row.revoked_at is not None:
        return "revoked"
    if row.expires_at <= (now or datetime.now(UTC)):
        return "expired"
    return "pending"


def _read(row: WorkspaceInvitation, now: datetime | None = None) -> WorkspaceInvitationRead:
    return WorkspaceInvitationRead(
        id=row.id,
        email=row.email,
        display_name=row.display_name,
        status=_status(row, now),
        expires_at=row.expires_at,
        accepted_at=row.accepted_at,
        revoked_at=row.revoked_at,
        version=row.version,
        created_at=row.created_at,
    )


def _secret(row: WorkspaceInvitation, token: str) -> WorkspaceInvitationSecret:
    return WorkspaceInvitationSecret(**_read(row).model_dump(), token=token)


def _masked_email(email: str) -> str:
    local, _, domain = email.partition("@")
    visible = local[:1]
    return f"{visible}{'*' * max(3, len(local) - 1)}@{domain}"


async def _lock_workspace(session: AsyncSession) -> None:
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:classid, 0)").bindparams(
            classid=WORKSPACE_INVITATION_LOCK_CLASSID
        )
    )


def _require_pending(row: WorkspaceInvitation, expected_version: int) -> None:
    if row.version != expected_version:
        raise HTTPException(status_code=409, detail="invitation version conflict")
    status = _status(row)
    if status != "pending":
        raise HTTPException(status_code=409, detail=f"invitation is {status}")


async def _by_id_for_update(session: AsyncSession, invitation_id: uuid.UUID) -> WorkspaceInvitation:
    row = (
        await session.execute(
            select(WorkspaceInvitation)
            .where(WorkspaceInvitation.id == invitation_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    return row


@router.get("/workspace-invitations", response_model=WorkspaceInvitationList)
async def list_workspace_invitations(
    limit: int = Query(default=100, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceInvitationList:
    _require_admin(user)
    total = (
        await session.execute(select(func.count()).select_from(WorkspaceInvitation))
    ).scalar_one()
    rows = (
        (
            await session.execute(
                select(WorkspaceInvitation)
                .order_by(WorkspaceInvitation.created_at.desc(), WorkspaceInvitation.id.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    now = datetime.now(UTC)
    return WorkspaceInvitationList(items=[_read(row, now) for row in rows], total=total)


@router.post(
    "/workspace-invitations",
    response_model=WorkspaceInvitationSecret,
    status_code=201,
    responses={403: {}, 409: {}},
)
async def create_workspace_invitation(
    body: WorkspaceInvitationCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceInvitationSecret:
    _require_admin(user)
    await _lock_workspace(session)
    existing_user = (
        await session.execute(select(User).where(User.email == body.email).with_for_update())
    ).scalar_one_or_none()
    if existing_user is not None and existing_user.is_active:
        raise HTTPException(status_code=409, detail="an active user with that email already exists")
    if existing_user is not None and existing_user.is_admin:
        raise HTTPException(status_code=409, detail="administrator accounts cannot be invited")
    now = datetime.now(UTC)
    pending = (
        await session.execute(
            select(WorkspaceInvitation.id).where(
                WorkspaceInvitation.email == body.email,
                WorkspaceInvitation.accepted_at.is_(None),
                WorkspaceInvitation.revoked_at.is_(None),
                WorkspaceInvitation.expires_at > now,
            )
        )
    ).scalar_one_or_none()
    if pending is not None:
        raise HTTPException(status_code=409, detail="a pending invitation already exists")
    token = _new_token()
    row = WorkspaceInvitation(
        email=body.email,
        display_name=body.display_name,
        token_hash=_digest(token),
        created_by_user_id=user.id,
        expires_at=now + timedelta(days=INVITATION_TTL_DAYS),
    )
    session.add(row)
    await session.flush()
    await session.commit()
    await session.refresh(row)
    return _secret(row, token)


@router.post(
    "/workspace-invitations/{invitation_id}/rotate",
    response_model=WorkspaceInvitationSecret,
    responses={403: {}, 404: {}, 409: {}},
)
async def rotate_workspace_invitation(
    invitation_id: uuid.UUID,
    body: WorkspaceInvitationMutation,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceInvitationSecret:
    _require_admin(user)
    row = await _by_id_for_update(session, invitation_id)
    _require_pending(row, body.expected_version)
    token = _new_token()
    row.token_hash = _digest(token)
    row.expires_at = datetime.now(UTC) + timedelta(days=INVITATION_TTL_DAYS)
    row.version += 1
    await session.commit()
    await session.refresh(row)
    return _secret(row, token)


@router.delete(
    "/workspace-invitations/{invitation_id}",
    status_code=204,
    responses={403: {}, 404: {}, 409: {}},
)
async def revoke_workspace_invitation(
    invitation_id: uuid.UUID,
    expected_version: int = Query(ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    _require_admin(user)
    row = await _by_id_for_update(session, invitation_id)
    _require_pending(row, expected_version)
    row.revoked_at = datetime.now(UTC)
    row.version += 1
    await session.commit()
    return Response(status_code=204)


async def _invitation_from_token(
    session: AsyncSession, token: str, *, lock: bool
) -> WorkspaceInvitation:
    statement = select(WorkspaceInvitation).where(WorkspaceInvitation.token_hash == _digest(token))
    if lock:
        statement = statement.with_for_update()
    row = (await session.execute(statement)).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail="invitation is unavailable",
            headers={"Cache-Control": "no-store"},
        )
    return row


@router.post(
    "/workspace-invitations/preview",
    response_model=WorkspaceInvitationPreview,
    responses={404: {}, 410: {}},
)
async def preview_workspace_invitation(
    body: WorkspaceInvitationToken,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> WorkspaceInvitationPreview:
    row = await _invitation_from_token(session, body.token, lock=False)
    status = _status(row)
    response.headers["Cache-Control"] = "no-store"
    if status != "pending":
        raise HTTPException(
            status_code=410,
            detail=f"invitation is {status}",
            headers={"Cache-Control": "no-store"},
        )
    return WorkspaceInvitationPreview(
        display_name=row.display_name,
        masked_email=_masked_email(row.email),
        status=status,
        expires_at=row.expires_at,
    )


@router.post(
    "/workspace-invitations/accept",
    response_model=WorkspaceInvitationAccepted,
    responses={404: {}, 409: {}, 410: {}},
)
async def accept_workspace_invitation(
    body: WorkspaceInvitationToken,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> WorkspaceInvitationAccepted:
    await _lock_workspace(session)
    row = await _invitation_from_token(session, body.token, lock=True)
    status = _status(row)
    if status != "pending":
        raise HTTPException(
            status_code=410,
            detail=f"invitation is {status}",
            headers={"Cache-Control": "no-store"},
        )
    existing_user = (
        await session.execute(select(User).where(User.email == row.email).with_for_update())
    ).scalar_one_or_none()
    if existing_user is not None and existing_user.is_active:
        raise HTTPException(
            status_code=409,
            detail="account is already active",
            headers={"Cache-Control": "no-store"},
        )
    if existing_user is not None and existing_user.is_admin:
        raise HTTPException(
            status_code=409,
            detail="administrator account cannot be reactivated",
            headers={"Cache-Control": "no-store"},
        )
    if existing_user is None:
        accepted_user = User(
            email=row.email,
            display_name=row.display_name,
            is_active=True,
            is_admin=False,
        )
        session.add(accepted_user)
        await session.flush()
    else:
        accepted_user = existing_user
        accepted_user.display_name = row.display_name
        accepted_user.is_active = True
    now = datetime.now(UTC)
    row.accepted_at = now
    row.accepted_user_id = accepted_user.id
    row.version += 1
    await session.commit()
    response.headers["Cache-Control"] = "no-store"
    return WorkspaceInvitationAccepted(
        email=accepted_user.email,
        display_name=accepted_user.display_name,
    )
