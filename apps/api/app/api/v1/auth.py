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

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
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


@router.get("/auth/config", response_model=AuthConfigRead)
async def auth_config(settings: Settings = Depends(get_settings)) -> AuthConfigRead:
    if settings.auth_mode != "oidc":
        return AuthConfigRead(auth_mode=settings.auth_mode)
    return AuthConfigRead(
        auth_mode="oidc",
        oidc_issuer=settings.oidc_issuer,
        oidc_client_id=settings.oidc_client_id,
        has_client_secret=bool(settings.oidc_client_secret),
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
