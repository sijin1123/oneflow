"""Auth configuration surface (expansion Pass 5 PR-N).

Deliberately UNAUTHENTICATED and independent of get_current_user: a login
screen must be able to discover the auth mode before any credential exists,
and in oidc mode every authenticated route returns 501 until the real flow
lands — this endpoint is the one that must keep answering.

Exposure policy: the issuer and client_id are public by OIDC design (they end
up in the browser anyway). The client secret is NEVER echoed — only its
presence as a boolean, so an operator can verify configuration without a
shell on the box.
"""

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import SESSION_COOKIE, SESSION_TTL_DAYS, token_hash
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.auth_session import AuthSession
from app.models.user import User

router = APIRouter()


class AuthConfigRead(BaseModel):
    auth_mode: str
    oidc_issuer: str | None = None
    oidc_client_id: str | None = None
    has_client_secret: bool = False
    command_palette_enabled: bool = False
    session_management_enabled: bool = False


@router.get("/auth/config", response_model=AuthConfigRead)
async def auth_config(settings: Settings = Depends(get_settings)) -> AuthConfigRead:
    if settings.auth_mode != "oidc":
        return AuthConfigRead(
            auth_mode=settings.auth_mode,
            command_palette_enabled=settings.command_palette_is_enabled,
            session_management_enabled=settings.dev_login_required_enabled,
        )
    return AuthConfigRead(
        auth_mode="oidc",
        oidc_issuer=settings.oidc_issuer,
        oidc_client_id=settings.oidc_client_id,
        has_client_secret=bool(settings.oidc_client_secret),
        command_palette_enabled=settings.command_palette_is_enabled,
        session_management_enabled=False,
    )


# ---- dev login/logout sessions (Pass 72, v72.1) ----------------------------
# Access control: dev mode is loopback-only (DevLoopbackGuardMiddleware) and
# forbidden in staging/production (startup guard) — that boundary, plus
# HttpOnly SameSite=Lax cookies and the CORS origin whitelist, is the CSRF
# contract for this dev tool (production-grade CSRF arrives with real OIDC).


class LoginRequest(BaseModel):
    email: str


class LoginResult(BaseModel):
    user_id: uuid.UUID
    email: str
    display_name: str


class AuthSessionRead(BaseModel):
    id: uuid.UUID
    created_at: datetime
    expires_at: datetime
    is_current: bool


class AuthSessionList(BaseModel):
    items: list[AuthSessionRead]
    total: int


def _set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_TTL_DAYS * 86400,
        httponly=True,
        samesite="lax",
        path="/",
        # http local dev keeps the cookie usable; anywhere else demands TLS.
        secure=settings.env not in {"development", "test"},
    )


async def _current_cookie_session(
    session: AsyncSession,
    settings: Settings,
    raw_token: str | None,
) -> tuple[AuthSession, User]:
    """Resolve only the interactive cookie identity for session management.

    Bearer credentials intentionally do not participate: personal access
    tokens must never enumerate or terminate browser sessions.
    """
    if settings.auth_mode == "oidc" or not settings.dev_login_required_enabled:
        raise HTTPException(status_code=404, detail="session management is unavailable")
    if not raw_token:
        raise HTTPException(status_code=401, detail="login required")
    row = (
        await session.execute(
            select(AuthSession, User)
            .join(User, User.id == AuthSession.user_id)
            .where(
                AuthSession.token_hash == token_hash(raw_token),
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > datetime.now(UTC),
                User.is_active.is_(True),
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=401, detail="login required")
    return row


def _require_allowed_origin(request: Request, settings: Settings) -> None:
    origin = request.headers.get("origin")
    if origin is None:
        referer = request.headers.get("referer")
        if referer is None:
            return
        parsed = urlsplit(referer)
        origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""
    if origin not in settings.cors_origin_list:
        raise HTTPException(status_code=403, detail="origin is not allowed")


@router.get("/me/sessions", response_model=AuthSessionList)
async def list_my_sessions(
    response: Response,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    oneflow_session: str | None = Cookie(default=None),
) -> AuthSessionList:
    current, user = await _current_cookie_session(session, settings, oneflow_session)
    rows = (
        (
            await session.execute(
                select(AuthSession)
                .where(
                    AuthSession.user_id == user.id,
                    AuthSession.revoked_at.is_(None),
                    AuthSession.expires_at > datetime.now(UTC),
                )
                .order_by(AuthSession.created_at.desc(), AuthSession.id.desc())
            )
        )
        .scalars()
        .all()
    )
    response.headers["Cache-Control"] = "no-store"
    items = [
        AuthSessionRead(
            id=item.id,
            created_at=item.created_at,
            expires_at=item.expires_at,
            is_current=item.id == current.id,
        )
        for item in rows
    ]
    return AuthSessionList(items=items, total=len(items))


@router.delete("/me/sessions/{session_id}", status_code=204)
async def revoke_my_session(
    session_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    oneflow_session: str | None = Cookie(default=None),
) -> Response:
    _require_allowed_origin(request, settings)
    current, user = await _current_cookie_session(session, settings, oneflow_session)
    await session.execute(
        sa_update(AuthSession)
        .where(
            AuthSession.id == session_id,
            AuthSession.user_id == user.id,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > datetime.now(UTC),
        )
        .values(revoked_at=datetime.now(UTC))
    )
    await session.commit()
    out = Response(status_code=204, headers={"Cache-Control": "no-store"})
    if session_id == current.id:
        out.delete_cookie(SESSION_COOKIE, path="/", httponly=True, samesite="lax")
    return out


@router.post("/auth/login", response_model=LoginResult)
async def dev_login(
    body: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> LoginResult:
    """Passwordless DEV login (Pass 72): the email of an existing ACTIVE
    directory user starts a 7-day session. Unknown and inactive emails are
    the SAME generic 401 (no account enumeration). oidc mode stays 501."""
    if settings.auth_mode == "oidc":
        raise HTTPException(status_code=501, detail="oidc auth mode is not implemented yet")
    email = body.email.strip().lower()
    user = (
        await session.execute(select(User).where(User.email == email, User.is_active.is_(True)))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="login failed")
    # Lazy cleanup (v72.1 R1-⑥): this user's expired/revoked rows go now.
    await session.execute(
        sa_delete(AuthSession).where(
            AuthSession.user_id == user.id,
            (AuthSession.expires_at <= datetime.now(UTC)) | AuthSession.revoked_at.is_not(None),
        )
    )
    token = secrets.token_urlsafe(32)  # ≥256-bit CSPRNG (v72.1 R1-②)
    session.add(
        AuthSession(
            token_hash=token_hash(token),
            user_id=user.id,
            expires_at=datetime.now(UTC) + timedelta(days=SESSION_TTL_DAYS),
        )
    )
    await session.commit()
    _set_session_cookie(response, token, settings)
    return LoginResult(user_id=user.id, email=user.email, display_name=user.display_name)


@router.post("/auth/logout", status_code=204)
async def dev_logout(
    response: Response,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    oneflow_session: str | None = Cookie(default=None),
) -> Response:
    """Revoke the cookie's session and clear the cookie — unauthenticated and
    idempotent (a missing/unknown cookie is still a clean 204)."""
    if settings.auth_mode == "oidc":
        raise HTTPException(status_code=501, detail="oidc auth mode is not implemented yet")
    if oneflow_session:
        await session.execute(
            sa_update(AuthSession)
            .where(
                AuthSession.token_hash == token_hash(oneflow_session),
                AuthSession.revoked_at.is_(None),
            )
            .values(revoked_at=datetime.now(UTC))
        )
        await session.commit()
    out = Response(status_code=204)
    out.delete_cookie(SESSION_COOKIE, path="/", httponly=True, samesite="lax")
    return out
