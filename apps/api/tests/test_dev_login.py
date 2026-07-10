"""Dev login/logout sessions (Pass 72 PR-CK, v72.1).

Two regimes:
- flag OFF (default): auth IGNORES cookies entirely — the historical
  zero-credential auto dev user stays deterministic (R1-④); login/logout
  endpoints still create/revoke sessions (the cookie just doesn't drive
  identity yet).
- flag ON: the `oneflow_session` cookie is the ONLY identity — missing,
  forged, expired, revoked all 401; inactive users are refused at login
  (generic 401) and at auth time (403).

oidc mode keeps 501 for login/logout; the dev loopback guard blocks
non-local callers before any of this runs.
"""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

from app.core.auth import DEV_USER_EMAIL
from app.main import create_app
from app.models import User
from app.models.auth_session import AuthSession
from tests.conftest import make_test_settings


@pytest.fixture
async def login_app(_clean_tables, app):
    """Flag-ON app sharing the SAME test DB/tables as the default app."""
    application = create_app(make_test_settings(dev_login_required="true"))
    yield application
    await application.state.engine.dispose()


@pytest.fixture
async def login_client(login_app):
    transport = ASGITransport(app=login_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_flag_off_ignores_cookies_and_still_issues_sessions(app, client):
    """OFF: /me works with no credentials AND with a forged cookie — always
    the auto dev user; a real login sets a well-formed cookie."""
    assert (await client.get("/api/v1/me")).status_code == 200
    client.cookies.set("oneflow_session", "forged-token")
    res = await client.get("/api/v1/me")
    assert res.status_code == 200
    assert res.json()["email"] == DEV_USER_EMAIL
    client.cookies.delete("oneflow_session")

    res = await client.post("/api/v1/auth/login", json={"email": DEV_USER_EMAIL})
    assert res.status_code == 200, res.text
    set_cookie = res.headers["set-cookie"]
    assert "oneflow_session=" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie
    assert "Path=/" in set_cookie
    assert "Secure" not in set_cookie  # env=test → http-friendly (v72.1 R1-②)

    # Logout revokes and clears — still 204 when repeated (idempotent).
    assert (await client.post("/api/v1/auth/logout")).status_code == 204
    assert (await client.post("/api/v1/auth/logout")).status_code == 204
    async with app.state.sessionmaker() as session:
        row = (await session.execute(select(AuthSession))).scalar_one()
        assert row.revoked_at is not None


async def test_login_failures_are_generic_401(app, client):
    async with app.state.sessionmaker() as session, session.begin():
        session.add(User(email="gone@oneflow.local", display_name="Gone", is_active=False))
    r1 = await client.post("/api/v1/auth/login", json={"email": "nobody@oneflow.local"})
    r2 = await client.post("/api/v1/auth/login", json={"email": "gone@oneflow.local"})
    assert (r1.status_code, r2.status_code) == (401, 401)
    assert r1.json()["detail"] == r2.json()["detail"]  # no account enumeration


async def test_flag_on_requires_valid_session(app, login_client):
    # No cookie → 401 (the goal's '/me 401' contract).
    assert (await login_client.get("/api/v1/me")).status_code == 401
    # Login → 200 with identity.
    res = await login_client.post("/api/v1/auth/login", json={"email": DEV_USER_EMAIL})
    assert res.status_code == 200, res.text
    me = await login_client.get("/api/v1/me")
    assert me.status_code == 200
    assert me.json()["email"] == DEV_USER_EMAIL
    # Logout → back to 401.
    assert (await login_client.post("/api/v1/auth/logout")).status_code == 204
    assert (await login_client.get("/api/v1/me")).status_code == 401
    # Forged token → 401.
    login_client.cookies.set("oneflow_session", "forged")
    assert (await login_client.get("/api/v1/me")).status_code == 401


async def test_flag_on_expired_session_401_and_login_lazy_cleanup(app, login_client):
    res = await login_client.post("/api/v1/auth/login", json={"email": DEV_USER_EMAIL})
    assert res.status_code == 200
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            update(AuthSession).values(expires_at=datetime.now(UTC) - timedelta(days=1))
        )
    assert (await login_client.get("/api/v1/me")).status_code == 401
    # Next login sweeps this user's stale rows (R1-⑥) and works again.
    res = await login_client.post("/api/v1/auth/login", json={"email": DEV_USER_EMAIL})
    assert res.status_code == 200
    async with app.state.sessionmaker() as session:
        rows = (await session.execute(select(AuthSession))).scalars().all()
        assert len(rows) == 1  # the stale one is gone
    assert (await login_client.get("/api/v1/me")).status_code == 200


async def test_flag_on_inactive_user_blocked(app, login_client):
    async with app.state.sessionmaker() as session, session.begin():
        session.add(User(email="temp@oneflow.local", display_name="Temp"))
    res = await login_client.post("/api/v1/auth/login", json={"email": "temp@oneflow.local"})
    assert res.status_code == 200
    # Deactivation kills the live session at auth time (403 — existing contract).
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            update(User).where(User.email == "temp@oneflow.local").values(is_active=False)
        )
    assert (await login_client.get("/api/v1/me")).status_code == 403


async def test_oidc_mode_keeps_501(_clean_tables):
    application = create_app(
        make_test_settings(
            auth_mode="oidc",
            oidc_issuer="https://idp.example.com",
            oidc_client_id="oneflow-test",
            oidc_client_secret="placeholder-not-a-real-secret",
        )
    )
    try:
        transport = ASGITransport(app=application)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            assert (await c.post("/api/v1/auth/login", json={"email": "x@y.z"})).status_code == 501
            assert (await c.post("/api/v1/auth/logout")).status_code == 501
            assert (await c.get("/api/v1/me")).status_code == 501
            cfg = await c.get("/api/v1/auth/config")
            assert cfg.status_code == 200  # discovery stays open for the login screen
    finally:
        await application.state.engine.dispose()


async def test_loopback_guard_blocks_nonlocal_login(nonlocal_client):
    """The dev loopback guard is the access boundary for passwordless login
    (v72.1 R1-⓪) — a non-local caller never reaches the endpoint."""
    res = await nonlocal_client.post("/api/v1/auth/login", json={"email": DEV_USER_EMAIL})
    assert res.status_code == 403
