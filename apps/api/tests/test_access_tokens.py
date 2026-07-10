from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

from app.main import create_app
from app.models.access_token import PersonalAccessToken
from tests.conftest import make_test_settings


@pytest.fixture
async def token_app(_clean_tables, app):
    """Session-required app sharing the same test DB, so Bearer auth proves
    tokens work without the dev auto-login fallback."""
    application = create_app(make_test_settings(dev_login_required="true"))
    yield application
    await application.state.engine.dispose()


@pytest.fixture
async def token_client(token_app):
    transport = ASGITransport(app=token_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def create_token(client, name="CLI deploy", days=30) -> dict:
    res = await client.post(
        "/api/v1/me/access-tokens",
        json={"name": name, "expires_in_days": days},
    )
    assert res.status_code == 201, res.text
    return res.json()


async def test_access_token_create_list_and_masking(client):
    created = await create_token(client, "  Local script  ")
    raw = created["token"]
    assert raw.startswith("ofp_")
    assert created["item"]["name"] == "Local script"
    assert created["item"]["token_prefix"] == raw[:12]

    listed = (await client.get("/api/v1/me/access-tokens")).json()
    assert listed["total"] == 1
    assert listed["items"][0]["token_prefix"] == raw[:12]
    assert "token" not in listed["items"][0]


async def test_bearer_token_authenticates_without_cookie(app, client, token_client):
    raw = (await create_token(client))["token"]
    me = await token_client.get("/api/v1/me", headers={"Authorization": f"Bearer {raw}"})
    assert me.status_code == 200, me.text
    assert me.json()["email"] == "dev@oneflow.local"

    async with app.state.sessionmaker() as session:
        row = (await session.execute(select(PersonalAccessToken))).scalar_one()
        assert row.last_used_at is not None


async def test_invalid_bearer_token_does_not_fall_back_to_dev_user(client):
    res = await client.get("/api/v1/me", headers={"Authorization": "Bearer ofp_forged"})
    assert res.status_code == 401


async def test_revoked_token_cannot_authenticate(client, token_client):
    created = await create_token(client)
    token_id = created["item"]["id"]
    raw = created["token"]

    assert (await client.delete(f"/api/v1/me/access-tokens/{token_id}")).status_code == 204
    res = await token_client.get("/api/v1/me", headers={"Authorization": f"Bearer {raw}"})
    assert res.status_code == 401

    listed = (await client.get("/api/v1/me/access-tokens")).json()
    assert listed["items"][0]["revoked_at"] is not None


async def test_expired_token_cannot_authenticate(app, client, token_client):
    raw = (await create_token(client, days=1))["token"]
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            update(PersonalAccessToken).values(expires_at=datetime.now(UTC) - timedelta(days=1))
        )

    res = await token_client.get("/api/v1/me", headers={"Authorization": f"Bearer {raw}"})
    assert res.status_code == 401
