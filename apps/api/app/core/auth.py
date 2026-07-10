"""Authentication dependency (PLAN §5, sessions Pass 72).

dev mode, ONEFLOW_DEV_LOGIN_REQUIRED off (default): returns the fixed dev
user, auto-provisioned via an atomic upsert — session cookies are IGNORED so
tests and scripts stay deterministic (v72.1 R1-④).
dev mode, flag on: a valid `oneflow_session` cookie is REQUIRED — missing,
unknown, expired or revoked all yield 401.
Bearer access tokens are validated before the interactive auth-mode branch.
oidc mode without a valid Bearer token: explicit 501 — never a silent bypass.
"""

import hashlib
from datetime import UTC, datetime

from fastapi import Cookie, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy import update as sa_update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.access_token import PersonalAccessToken
from app.models.auth_session import AuthSession
from app.models.user import User

DEV_USER_EMAIL = "dev@oneflow.local"
DEV_USER_NAME = "Dev User"

SESSION_COOKIE = "oneflow_session"
SESSION_TTL_DAYS = 7


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def session_user(session: AsyncSession, token: str | None) -> User | None:
    """The user behind a session cookie — None unless the token maps to an
    unexpired, unrevoked session with an ACTIVE user."""
    if not token:
        return None
    row = (
        await session.execute(
            select(User)
            .join(AuthSession, AuthSession.user_id == User.id)
            .where(
                AuthSession.token_hash == token_hash(token),
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > datetime.now(UTC),
            )
        )
    ).scalar_one_or_none()
    return row


def bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    token = value.strip()
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="invalid bearer token")
    return token


async def access_token_user(session: AsyncSession, authorization: str | None) -> User | None:
    raw = bearer_token(authorization)
    if raw is None:
        return None
    row = (
        await session.execute(
            select(User, PersonalAccessToken)
            .join(PersonalAccessToken, PersonalAccessToken.user_id == User.id)
            .where(
                PersonalAccessToken.token_hash == token_hash(raw),
                PersonalAccessToken.revoked_at.is_(None),
                PersonalAccessToken.expires_at > datetime.now(UTC),
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=401, detail="invalid bearer token")
    user, token_row = row
    if not user.is_active:
        raise HTTPException(status_code=403, detail="account disabled")
    await session.execute(
        sa_update(PersonalAccessToken)
        .where(PersonalAccessToken.id == token_row.id)
        .values(last_used_at=datetime.now(UTC))
    )
    await session.commit()
    return user


async def get_current_user(
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    oneflow_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
) -> User:
    if authorization:
        return await access_token_user(session, authorization)
    if settings.auth_mode == "oidc":
        raise HTTPException(status_code=501, detail="oidc auth mode is not implemented yet")
    if settings.dev_login_required_enabled:
        # Session-cookie regime (Pass 72): the cookie is the ONLY identity.
        user = await session_user(session, oneflow_session)
        if user is None:
            raise HTTPException(status_code=401, detail="login required")
        if not user.is_active:
            raise HTTPException(status_code=403, detail="account disabled")
        return user
    # dev mode is only reachable in development/test (startup guard §9).
    user = (
        await session.execute(select(User).where(User.email == DEV_USER_EMAIL))
    ).scalar_one_or_none()
    if user is None:
        # The dev user bootstraps as workspace admin — dev mode is the only
        # login that exists today; the production bootstrap (env-designated
        # first admin) arrives with the real OIDC pass (PLAN v33).
        stmt = (
            pg_insert(User)
            .values(email=DEV_USER_EMAIL, display_name=DEV_USER_NAME, is_active=True, is_admin=True)
            .on_conflict_do_nothing(index_elements=[User.email])
        )
        await session.execute(stmt)
        await session.commit()
        user = (
            await session.execute(select(User).where(User.email == DEV_USER_EMAIL))
        ).scalar_one()
    # Deactivation blocks authentication only — memberships, assignments, and
    # authored history stay intact (lock semantics, PLAN v33).
    if not user.is_active:
        raise HTTPException(status_code=403, detail="account disabled")
    return user
