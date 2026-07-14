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

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

from app.core.auth import DEV_USER_EMAIL
from app.main import create_app
from app.models import User
from app.models.auth_session import AuthSession
from tests.conftest import make_test_settings

DEV_LOGIN_PASSWORD = "test-development-password"


@pytest.fixture
async def login_app(_clean_tables, app):
    """Flag-ON app sharing the SAME test DB/tables as the default app."""
    application = create_app(
        make_test_settings(
            dev_login_required="true", dev_login_password=DEV_LOGIN_PASSWORD
        )
    )
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


async def test_required_login_keeps_password_and_account_failures_generic(login_app, login_client):
    async with login_app.state.sessionmaker() as session, session.begin():
        session.add(User(email="gone@oneflow.local", display_name="Gone", is_active=False))
    attempts = [
        {"email": DEV_USER_EMAIL},
        {"email": DEV_USER_EMAIL, "password": "wrong-password"},
        {"email": DEV_USER_EMAIL, "password": "잘못된-비밀번호"},
        {"email": "nobody@oneflow.local", "password": DEV_LOGIN_PASSWORD},
        {"email": "gone@oneflow.local", "password": DEV_LOGIN_PASSWORD},
    ]
    responses = [
        await login_client.post("/api/v1/auth/login", json=payload) for payload in attempts
    ]
    assert all(response.status_code == 401 for response in responses)
    assert {response.json()["detail"] for response in responses} == {"login failed"}


async def test_remembered_login_sets_persistent_cookie_and_seven_day_session(
    login_app, login_client
):
    started_at = datetime.now(UTC)
    remembered = await login_client.post(
        "/api/v1/auth/login",
        json={
            "email": DEV_USER_EMAIL,
            "password": DEV_LOGIN_PASSWORD,
            "remember_me": True,
        },
    )
    assert remembered.status_code == 200
    assert "Max-Age=604800" in remembered.headers["set-cookie"]

    nonremembered = await login_client.post(
        "/api/v1/auth/login",
        json={"email": DEV_USER_EMAIL, "password": DEV_LOGIN_PASSWORD},
    )
    assert nonremembered.status_code == 200
    assert "Max-Age" not in nonremembered.headers["set-cookie"]

    async with login_app.state.sessionmaker() as session:
        expirations = sorted(
            (await session.execute(select(AuthSession.expires_at))).scalars().all()
        )
    assert len(expirations) == 2
    assert expirations[0] - started_at < timedelta(hours=12, minutes=1)
    assert expirations[0] - started_at > timedelta(hours=11, minutes=59)
    assert expirations[1] - started_at < timedelta(days=7, minutes=1)
    assert expirations[1] - started_at > timedelta(days=6, hours=23, minutes=59)


async def test_flag_on_requires_valid_session(app, login_client):
    # No cookie → 401 (the goal's '/me 401' contract).
    assert (await login_client.get("/api/v1/me")).status_code == 401
    # Login → 200 with identity.
    res = await login_client.post(
        "/api/v1/auth/login", json={"email": DEV_USER_EMAIL, "password": DEV_LOGIN_PASSWORD}
    )
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


async def test_session_management_lists_only_own_active_sessions(login_app, login_client):
    login = await login_client.post(
        "/api/v1/auth/login", json={"email": DEV_USER_EMAIL, "password": DEV_LOGIN_PASSWORD}
    )
    assert login.status_code == 200
    transport = ASGITransport(app=login_app)
    async with AsyncClient(transport=transport, base_url="http://test") as second:
        login = await second.post(
            "/api/v1/auth/login", json={"email": DEV_USER_EMAIL, "password": DEV_LOGIN_PASSWORD}
        )
        assert login.status_code == 200

        async with login_app.state.sessionmaker() as session, session.begin():
            dev_id = (
                await session.execute(select(User.id).where(User.email == DEV_USER_EMAIL))
            ).scalar_one()
            stranger = User(email="other@oneflow.local", display_name="Other")
            session.add(stranger)
            await session.flush()
            session.add_all(
                [
                    AuthSession(
                        token_hash="a" * 64,
                        user_id=stranger.id,
                        expires_at=datetime.now(UTC) + timedelta(days=1),
                    ),
                    AuthSession(
                        token_hash="b" * 64,
                        user_id=dev_id,
                        expires_at=datetime.now(UTC) - timedelta(seconds=1),
                    ),
                ]
            )

        listed = await login_client.get("/api/v1/me/sessions")
        assert listed.status_code == 200, listed.text
        assert listed.headers["cache-control"] == "no-store"
        body = listed.json()
        assert body["total"] == 2
        assert sum(item["is_current"] for item in body["items"]) == 1
        assert set(body["items"][0]) == {"id", "created_at", "expires_at", "is_current"}
        assert all("token" not in key for item in body["items"] for key in item)


async def test_session_revoke_is_owner_scoped_idempotent_and_clears_current(
    login_app, login_client
):
    login = await login_client.post(
        "/api/v1/auth/login", json={"email": DEV_USER_EMAIL, "password": DEV_LOGIN_PASSWORD}
    )
    assert login.status_code == 200
    transport = ASGITransport(app=login_app)
    async with AsyncClient(transport=transport, base_url="http://test") as second:
        login = await second.post(
            "/api/v1/auth/login", json={"email": DEV_USER_EMAIL, "password": DEV_LOGIN_PASSWORD}
        )
        assert login.status_code == 200
        second_id = next(
            item["id"]
            for item in (await second.get("/api/v1/me/sessions")).json()["items"]
            if item["is_current"]
        )
        endpoint = f"/api/v1/me/sessions/{second_id}"
        concurrent = await asyncio.gather(
            login_client.delete(endpoint), login_client.delete(endpoint)
        )
        assert [response.status_code for response in concurrent] == [204, 204]
        assert (await login_client.delete(endpoint)).status_code == 204
        assert (await second.get("/api/v1/me/sessions")).status_code == 401

    async with login_app.state.sessionmaker() as session, session.begin():
        stranger = User(email="foreign@oneflow.local", display_name="Foreign")
        session.add(stranger)
        await session.flush()
        foreign = AuthSession(
            token_hash="c" * 64,
            user_id=stranger.id,
            expires_at=datetime.now(UTC) + timedelta(days=1),
        )
        session.add(foreign)
        await session.flush()
        foreign_id = foreign.id
    assert (await login_client.delete(f"/api/v1/me/sessions/{foreign_id}")).status_code == 204
    async with login_app.state.sessionmaker() as session:
        assert (await session.get(AuthSession, foreign_id)).revoked_at is None

    current_id = next(
        item["id"]
        for item in (await login_client.get("/api/v1/me/sessions")).json()["items"]
        if item["is_current"]
    )
    revoked = await login_client.delete(f"/api/v1/me/sessions/{current_id}")
    assert revoked.status_code == 204
    assert "oneflow_session=" in revoked.headers["set-cookie"]
    assert "Max-Age=0" in revoked.headers["set-cookie"]
    assert (await login_client.get("/api/v1/me/sessions")).status_code == 401


async def test_session_management_rejects_wrong_mode_bearer_and_foreign_origin(
    client, login_client
):
    off = await client.get("/api/v1/auth/config")
    assert off.json()["session_management_enabled"] is False
    assert (await client.get("/api/v1/me/sessions")).status_code == 404

    cfg = await login_client.get("/api/v1/auth/config")
    assert cfg.json()["session_management_enabled"] is True
    bearer_only = await login_client.get(
        "/api/v1/me/sessions", headers={"Authorization": "Bearer fake"}
    )
    assert bearer_only.status_code == 401
    login = await login_client.post(
        "/api/v1/auth/login", json={"email": DEV_USER_EMAIL, "password": DEV_LOGIN_PASSWORD}
    )
    assert login.status_code == 200
    current_id = next(
        item["id"]
        for item in (await login_client.get("/api/v1/me/sessions")).json()["items"]
        if item["is_current"]
    )
    denied = await login_client.delete(
        f"/api/v1/me/sessions/{current_id}", headers={"Origin": "https://evil.example"}
    )
    assert denied.status_code == 403
    denied_referer = await login_client.delete(
        f"/api/v1/me/sessions/{current_id}",
        headers={"Referer": "https://evil.example/settings"},
    )
    assert denied_referer.status_code == 403
    allowed_referer = await login_client.delete(
        f"/api/v1/me/sessions/{uuid.uuid4()}",
        headers={"Referer": "http://localhost:5173/settings"},
    )
    assert allowed_referer.status_code == 204
    assert (await login_client.get("/api/v1/me/sessions")).status_code == 200


async def test_flag_on_expired_session_401_and_login_lazy_cleanup(app, login_client):
    res = await login_client.post(
        "/api/v1/auth/login", json={"email": DEV_USER_EMAIL, "password": DEV_LOGIN_PASSWORD}
    )
    assert res.status_code == 200
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            update(AuthSession).values(expires_at=datetime.now(UTC) - timedelta(days=1))
        )
    assert (await login_client.get("/api/v1/me")).status_code == 401
    # Next login sweeps this user's stale rows (R1-⑥) and works again.
    res = await login_client.post(
        "/api/v1/auth/login", json={"email": DEV_USER_EMAIL, "password": DEV_LOGIN_PASSWORD}
    )
    assert res.status_code == 200
    async with app.state.sessionmaker() as session:
        rows = (await session.execute(select(AuthSession))).scalars().all()
        assert len(rows) == 1  # the stale one is gone
    assert (await login_client.get("/api/v1/me")).status_code == 200


async def test_flag_on_inactive_user_blocked(app, login_client):
    async with app.state.sessionmaker() as session, session.begin():
        session.add(User(email="temp@oneflow.local", display_name="Temp"))
    res = await login_client.post(
        "/api/v1/auth/login", json={"email": "temp@oneflow.local", "password": DEV_LOGIN_PASSWORD}
    )
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
