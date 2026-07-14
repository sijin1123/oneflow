"""Auth configuration surface (expansion Pass 5 PR-N).

Deliberately UNAUTHENTICATED and independent of get_current_user: a login
screen must discover the active auth mode before any credential exists.

Exposure policy: the issuer and client_id are public by OIDC design (they end
up in the browser anyway). The client secret is NEVER echoed — only its
presence as a boolean, so an operator can verify configuration without a
shell on the box.
"""

import base64
import hashlib
import hmac
import logging
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, SecretStr
from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy import update as sa_update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import SESSION_COOKIE, SESSION_TTL_DAYS, token_hash
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.auth_session import AuthSession
from app.models.oidc import OidcIdentity, OidcLoginAttempt
from app.models.user import User
from app.services.oidc import (
    OidcProviderError,
    discover,
    exchange_code,
    provider_client,
    verify_id_token,
)

router = APIRouter()
logger = logging.getLogger(__name__)
OIDC_ATTEMPT_TTL_MINUTES = 10
OIDC_TRANSACTION_COOKIE = "oneflow_oidc_transaction"
OIDC_CALLBACK_PATH = "/api/v1/auth/oidc/callback"
OidcProviderAlias = Literal["google", "microsoft", "sso"]


class AuthConfigRead(BaseModel):
    auth_mode: str
    oidc_issuer: str | None = None
    oidc_client_id: str | None = None
    oidc_provider: OidcProviderAlias | None = None
    oidc_providers: list[OidcProviderAlias] = Field(default_factory=list)
    has_client_secret: bool = False
    command_palette_enabled: bool = False
    session_management_enabled: bool = False
    password_required: bool = False
    oidc_login_enabled: bool = False


@router.get("/auth/config", response_model=AuthConfigRead)
async def auth_config(settings: Settings = Depends(get_settings)) -> AuthConfigRead:
    if settings.auth_mode != "oidc":
        return AuthConfigRead(
            auth_mode=settings.auth_mode,
            command_palette_enabled=settings.command_palette_is_enabled,
            session_management_enabled=settings.dev_login_required_enabled,
            password_required=settings.dev_login_required_enabled,
            oidc_login_enabled=False,
        )
    provider_configs = settings.oidc_provider_configs
    provider_aliases = list(provider_configs)
    only_provider = provider_configs[provider_aliases[0]] if len(provider_aliases) == 1 else None
    return AuthConfigRead(
        auth_mode="oidc",
        # Keep the single-provider fields for rolling web compatibility. A
        # multi-provider deployment must use the explicit aliases below.
        oidc_issuer=only_provider.issuer if only_provider else None,
        oidc_client_id=only_provider.client_id if only_provider else None,
        oidc_provider=only_provider.alias if only_provider else None,
        oidc_providers=provider_aliases,
        has_client_secret=bool(provider_configs),
        command_palette_enabled=settings.command_palette_is_enabled,
        session_management_enabled=True,
        password_required=False,
        oidc_login_enabled=bool(provider_configs),
    )


def _safe_next_path(value: str | None) -> str:
    candidate = (value or "/").strip()
    parts = urlsplit(candidate)
    if (
        not candidate.startswith("/")
        or candidate.startswith("//")
        or "\\" in candidate
        or len(candidate) > 2048
        or parts.scheme
        or parts.netloc
        or any(ord(char) < 32 for char in candidate)
    ):
        return "/"
    return candidate


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _pkce_challenge(verifier: str) -> str:
    return (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    )


def _append_query(url: str, values: dict[str, str]) -> str:
    parts = urlsplit(url)
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key not in values
    ]
    query.extend(values.items())
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), ""))


def _web_url(settings: Settings, path: str) -> str:
    return (settings.oidc_web_origin or "").rstrip("/") + path


def _auth_error_redirect(
    settings: Settings, error: str, *, clear_transaction: bool = True
) -> RedirectResponse:
    response = RedirectResponse(
        _web_url(settings, "/login?" + urlencode({"auth_error": error})),
        status_code=303,
        headers={"Cache-Control": "no-store"},
    )
    if clear_transaction:
        _clear_oidc_transaction_cookie(response)
    return response


def _clear_oidc_transaction_cookie(response: Response) -> None:
    response.delete_cookie(
        OIDC_TRANSACTION_COOKIE,
        path=OIDC_CALLBACK_PATH,
        secure=True,
        httponly=True,
        samesite="lax",
    )


@router.get("/auth/oidc/start")
async def oidc_start(
    request: Request,
    provider: OidcProviderAlias,
    next: str | None = None,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    """Start a server-side Authorization Code + PKCE transaction."""
    if settings.auth_mode != "oidc":
        raise HTTPException(status_code=404, detail="oidc login is unavailable")
    provider_config = settings.oidc_provider_config(provider)
    if provider_config is None:
        raise HTTPException(status_code=404, detail="oidc provider is unavailable")
    existing_client = getattr(request.app.state, "oidc_http_client", None)
    try:
        async with provider_client(existing_client) as client:
            metadata = await discover(client, provider_config)
    except OidcProviderError:
        logger.warning("OIDC discovery rejected during login start", exc_info=True)
        raise HTTPException(status_code=503, detail="identity provider is unavailable") from None

    state = secrets.token_urlsafe(32)
    browser_token = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    code_verifier = secrets.token_urlsafe(64)
    now = datetime.now(UTC)
    await session.execute(sa_delete(OidcLoginAttempt).where(OidcLoginAttempt.expires_at <= now))
    session.add(
        OidcLoginAttempt(
            state_hash=_hash_secret(state),
            browser_token_hash=_hash_secret(browser_token),
            nonce_hash=_hash_secret(nonce),
            code_verifier=code_verifier,
            provider=provider,
            config_fingerprint=provider_config.config_fingerprint,
            next_path=_safe_next_path(next),
            expires_at=now + timedelta(minutes=OIDC_ATTEMPT_TTL_MINUTES),
        )
    )
    await session.commit()
    authorization_url = _append_query(
        metadata.authorization_endpoint,
        {
            "response_type": "code",
            "scope": "openid profile email",
            "client_id": provider_config.client_id,
            "redirect_uri": provider_config.redirect_uri,
            "state": state,
            "nonce": nonce,
            "code_challenge": _pkce_challenge(code_verifier),
            "code_challenge_method": "S256",
        },
    )
    response = RedirectResponse(
        authorization_url,
        status_code=302,
        headers={"Cache-Control": "no-store"},
    )
    response.set_cookie(
        OIDC_TRANSACTION_COOKIE,
        browser_token,
        max_age=OIDC_ATTEMPT_TTL_MINUTES * 60,
        secure=True,
        httponly=True,
        samesite="lax",
        path=OIDC_CALLBACK_PATH,
    )
    return response


@router.get("/auth/oidc/callback")
async def oidc_callback(
    request: Request,
    state: str | None = None,
    code: str | None = None,
    error: str | None = None,
    oneflow_oidc_transaction: str | None = Cookie(default=None),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    """Consume one OIDC transaction, bind its subject, and issue a session."""
    if settings.auth_mode != "oidc":
        raise HTTPException(status_code=404, detail="oidc login is unavailable")
    if (
        not state
        or len(state) > 512
        or not oneflow_oidc_transaction
        or len(oneflow_oidc_transaction) > 512
    ):
        return _auth_error_redirect(settings, "invalid_state", clear_transaction=False)
    consumed = (
        await session.execute(
            sa_delete(OidcLoginAttempt)
            .where(
                OidcLoginAttempt.state_hash == _hash_secret(state),
                OidcLoginAttempt.browser_token_hash == _hash_secret(oneflow_oidc_transaction),
                OidcLoginAttempt.expires_at > datetime.now(UTC),
            )
            .returning(
                OidcLoginAttempt.nonce_hash,
                OidcLoginAttempt.code_verifier,
                OidcLoginAttempt.provider,
                OidcLoginAttempt.config_fingerprint,
                OidcLoginAttempt.next_path,
            )
        )
    ).one_or_none()
    await session.commit()
    if consumed is None:
        return _auth_error_redirect(settings, "invalid_state", clear_transaction=False)
    provider_config = (
        settings.oidc_provider_config(consumed.provider) if consumed.provider is not None else None
    )
    if (
        provider_config is None
        or consumed.config_fingerprint is None
        or not hmac.compare_digest(consumed.config_fingerprint, provider_config.config_fingerprint)
    ):
        return _auth_error_redirect(settings, "provider_error")
    if error:
        return _auth_error_redirect(
            settings, "access_denied" if error == "access_denied" else "provider_error"
        )
    if not code or len(code) > 8192:
        return _auth_error_redirect(settings, "invalid_response")

    existing_client = getattr(request.app.state, "oidc_http_client", None)
    try:
        async with provider_client(existing_client) as client:
            metadata = await discover(client, provider_config)
            id_token = await exchange_code(
                client,
                provider_config,
                metadata,
                code=code,
                code_verifier=consumed.code_verifier,
            )
            claims = await verify_id_token(
                client,
                provider_config,
                metadata,
                id_token=id_token,
                nonce_hash=consumed.nonce_hash,
            )
    except OidcProviderError:
        logger.warning("OIDC callback rejected provider response", exc_info=True)
        return _auth_error_redirect(settings, "provider_error")

    user = (
        await session.execute(
            select(User)
            .join(OidcIdentity, OidcIdentity.user_id == User.id)
            .where(
                OidcIdentity.issuer == claims.issuer,
                OidcIdentity.subject == claims.subject,
            )
        )
    ).scalar_one_or_none()
    if user is None:
        provisioned = None
        if claims.binding_email is not None:
            provisioned = (
                await session.execute(select(User).where(User.email == claims.binding_email))
            ).scalar_one_or_none()
        if provisioned is None or not provisioned.is_active:
            await session.rollback()
            return _auth_error_redirect(settings, "account_unavailable")
        await session.execute(
            pg_insert(OidcIdentity)
            .values(
                issuer=claims.issuer,
                subject=claims.subject,
                user_id=provisioned.id,
            )
            .on_conflict_do_nothing()
        )
        user = (
            await session.execute(
                select(User)
                .join(OidcIdentity, OidcIdentity.user_id == User.id)
                .where(
                    OidcIdentity.issuer == claims.issuer,
                    OidcIdentity.subject == claims.subject,
                )
            )
        ).scalar_one_or_none()
    if user is None or not user.is_active:
        await session.rollback()
        return _auth_error_redirect(settings, "account_unavailable")

    await session.execute(
        sa_delete(AuthSession).where(
            AuthSession.user_id == user.id,
            (AuthSession.expires_at <= datetime.now(UTC)) | AuthSession.revoked_at.is_not(None),
        )
    )
    token = secrets.token_urlsafe(32)
    session.add(
        AuthSession(
            token_hash=token_hash(token),
            user_id=user.id,
            expires_at=datetime.now(UTC) + timedelta(days=SESSION_TTL_DAYS),
        )
    )
    await session.commit()
    response = RedirectResponse(
        _web_url(settings, consumed.next_path),
        status_code=303,
        headers={"Cache-Control": "no-store"},
    )
    _set_session_cookie(response, token, settings, remember_me=True)
    _clear_oidc_transaction_cookie(response)
    return response


# ---- dev login/logout sessions (Pass 72, v72.1) ----------------------------
# Access control: dev mode is loopback-only (DevLoopbackGuardMiddleware) and
# forbidden in staging/production (startup guard). OIDC sessions share the
# same hashed server-side store and add strict Origin/Referer checks to writes.


class LoginRequest(BaseModel):
    email: str
    password: SecretStr | None = None
    remember_me: bool = False


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


def _set_session_cookie(
    response: Response, token: str, settings: Settings, *, remember_me: bool
) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_TTL_DAYS * 86400 if remember_me else None,
        httponly=True,
        samesite="lax",
        path="/",
        # OIDC always returns through HTTPS; only local dev-login sessions may
        # use an HTTP-friendly cookie in development/test.
        secure=settings.auth_mode == "oidc" or settings.env not in {"development", "test"},
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
    if settings.auth_mode != "oidc" and not settings.dev_login_required_enabled:
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
            if settings.auth_mode == "oidc":
                raise HTTPException(status_code=403, detail="origin is required")
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
    """Development login with generic failures and optional remembered sessions."""
    if settings.auth_mode == "oidc":
        raise HTTPException(status_code=404, detail="password login is unavailable")
    password_matches = True
    if settings.dev_login_required_enabled:
        configured_password = settings.dev_login_password
        supplied_password = (body.password.get_secret_value() if body.password else "").encode(
            "utf-8"
        )
        configured_password_bytes = (
            configured_password.get_secret_value().encode("utf-8")
            if configured_password is not None
            else b""
        )
        password_matches = hmac.compare_digest(
            hashlib.sha256(supplied_password).digest(),
            hashlib.sha256(configured_password_bytes).digest(),
        )
    email = body.email.strip().lower()
    user = (
        await session.execute(select(User).where(User.email == email, User.is_active.is_(True)))
    ).scalar_one_or_none()
    # Query and credential comparison are both completed before the generic
    # failure so password validity cannot be inferred from the response path.
    if user is None or not password_matches:
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
            expires_at=datetime.now(UTC)
            + (timedelta(days=SESSION_TTL_DAYS) if body.remember_me else timedelta(hours=12)),
        )
    )
    await session.commit()
    _set_session_cookie(response, token, settings, remember_me=body.remember_me)
    return LoginResult(user_id=user.id, email=user.email, display_name=user.display_name)


@router.post("/auth/logout", status_code=204)
async def dev_logout(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    oneflow_session: str | None = Cookie(default=None),
) -> Response:
    """Revoke the cookie's session and clear the cookie — unauthenticated and
    idempotent (a missing/unknown cookie is still a clean 204)."""
    _require_allowed_origin(request, settings)
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
