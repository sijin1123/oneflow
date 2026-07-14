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
        "session_management_enabled": False,
        "password_required": False,
    }


async def test_dev_login_password_is_never_exposed_in_auth_config():
    password = "test-development-password"
    app = create_app(
        make_test_settings(dev_login_required="true", dev_login_password=password)
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/auth/config")
        assert res.status_code == 200
        assert res.json()["password_required"] is True
        assert password not in res.text
    await app.state.engine.dispose()


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
        assert body["session_management_enabled"] is False
        assert body["password_required"] is False
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


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"dev_login_required": "true"}, "requires ONEFLOW_DEV_LOGIN_PASSWORD"),
        ({"dev_login_required": "enabled"}, "accepts exactly 'true' or 'false'"),
        ({"dev_login_password": "short"}, "at least 12 characters"),
        (
            {
                "env": "production",
                "auth_mode": "oidc",
                "oidc_issuer": "https://idp.example.com",
                "oidc_client_id": "oneflow-web",
                "oidc_client_secret": "secret",
                "dev_login_password": "test-development-password",
            },
            "only valid in development/test",
        ),
    ],
)
def test_dev_login_password_startup_guards(overrides, message):
    with pytest.raises(Exception, match=message):
        make_test_settings(**overrides)
