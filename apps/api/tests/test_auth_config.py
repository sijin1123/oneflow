"""OIDC configuration surface (expansion PLAN Pass 5 PR-N).

Contract: /auth/config is unauthenticated (a login screen must reach it in
oidc mode where every authenticated route is 501); the client secret is never
echoed anywhere; oidc mode without a complete config fails startup."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app
from tests.conftest import make_test_settings


async def test_dev_mode_config_is_minimal(client):
    res = await client.get("/api/v1/auth/config")
    assert res.status_code == 200
    assert res.json() == {
        "auth_mode": "dev",
        "oidc_issuer": None,
        "oidc_client_id": None,
        "has_client_secret": False,
        "command_palette_enabled": False,
    }


async def test_command_palette_config_flag_is_public_and_default_off():
    settings = make_test_settings(command_palette_enabled="true")
    app = create_app(settings)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/auth/config")
        assert res.status_code == 200
        assert res.json()["command_palette_enabled"] is True
    await app.state.engine.dispose()


async def test_oidc_mode_answers_config_but_501s_everything_else():
    settings = make_test_settings(
        auth_mode="oidc",
        oidc_issuer="https://idp.example.com/realms/test",
        oidc_client_id="oneflow-web",
        oidc_client_secret="s3cr3t-value",
    )
    app = create_app(settings)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # The config surface stays reachable (no auth dependency)…
        res = await client.get("/api/v1/auth/config")
        assert res.status_code == 200
        body = res.json()
        assert body["auth_mode"] == "oidc"
        assert body["oidc_issuer"] == "https://idp.example.com/realms/test"
        assert body["oidc_client_id"] == "oneflow-web"
        assert body["has_client_secret"] is True
        assert body["command_palette_enabled"] is False
        # …and the secret VALUE appears nowhere in the response.
        assert "s3cr3t-value" not in res.text

        # Every authenticated route keeps the explicit 501.
        assert (await client.get("/api/v1/projects")).status_code == 501
        assert (await client.get("/api/v1/me")).status_code == 501


def test_oidc_mode_without_config_fails_startup():
    with pytest.raises(Exception, match="ONEFLOW_OIDC_ISSUER"):
        make_test_settings(auth_mode="oidc")


def test_oidc_issuer_must_be_https():
    with pytest.raises(Exception, match="https"):
        make_test_settings(
            auth_mode="oidc",
            oidc_issuer="http://insecure.example.com",
            oidc_client_id="x",
            oidc_client_secret="y",
        )


def test_dev_mode_ignores_partial_oidc_values():
    # Extra oidc values in dev mode are inert — no guard trips.
    s: Settings = make_test_settings(oidc_issuer="https://idp.example.com")
    assert s.auth_mode == "dev"
