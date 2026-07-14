"""OIDC configuration and fail-closed startup surface.

Contract: /auth/config is unauthenticated, secrets are never echoed, and OIDC
mode without complete trust anchors fails startup."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app
from tests.conftest import (
    make_oidc_provider_test_settings,
    make_oidc_test_settings,
    make_test_settings,
)


async def test_dev_mode_config_is_minimal(client):
    res = await client.get("/api/v1/auth/config")
    assert res.status_code == 200
    assert res.json() == {
        "auth_mode": "dev",
        "oidc_issuer": None,
        "oidc_client_id": None,
        "oidc_provider": None,
        "oidc_providers": [],
        "has_client_secret": False,
        "command_palette_enabled": False,
        "session_management_enabled": False,
        "password_required": False,
        "oidc_login_enabled": False,
    }


async def test_dev_login_password_is_never_exposed_in_auth_config():
    password = "test-development-password"
    app = create_app(make_test_settings(dev_login_required="true", dev_login_password=password))
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


async def test_oidc_mode_answers_config_and_requires_a_login_session():
    settings = make_oidc_test_settings(
        oidc_issuer="https://idp.example.com/realms/test",
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
        assert body["oidc_provider"] == "sso"
        assert body["oidc_providers"] == ["sso"]
        assert body["has_client_secret"] is True
        assert body["command_palette_enabled"] is False
        assert body["session_management_enabled"] is True
        assert body["password_required"] is False
        assert body["oidc_login_enabled"] is True
        # …and the secret VALUE appears nowhere in the response.
        assert "s3cr3t-value" not in res.text

        # Authenticated routes require a validated OIDC session.
        assert (await client.get("/api/v1/projects")).status_code == 401
        assert (await client.get("/api/v1/me")).status_code == 401


def test_oidc_mode_without_config_fails_startup():
    with pytest.raises(Exception, match="at least one complete OIDC provider"):
        make_test_settings(auth_mode="oidc")


def test_oidc_issuer_must_be_https():
    with pytest.raises(Exception, match="https"):
        make_oidc_test_settings(
            oidc_issuer="http://insecure.example.com",
        )


def test_oidc_web_origin_must_be_in_cors_allowlist():
    with pytest.raises(Exception, match="ONEFLOW_CORS_ORIGINS"):
        make_oidc_test_settings(cors_origins="https://another.example.com")


def test_oidc_cross_host_allowlist_rejects_url_shaped_entries():
    with pytest.raises(Exception, match="exact host"):
        make_oidc_test_settings(oidc_allowed_hosts="https://keys.example.com")


def test_oidc_provider_must_use_the_public_closed_vocabulary():
    with pytest.raises(Exception, match="ONEFLOW_OIDC_PROVIDER"):
        make_oidc_test_settings(oidc_provider="custom")


def test_dev_mode_ignores_partial_oidc_values():
    # Extra oidc values in dev mode are inert — no guard trips.
    s: Settings = make_test_settings(oidc_issuer="https://idp.example.com")
    assert s.auth_mode == "dev"


def test_legacy_oidc_provider_remains_available_without_provider_groups():
    settings = make_oidc_test_settings(oidc_allowed_email_domains="example.test")
    assert settings.enabled_oidc_provider_aliases == ("sso",)
    provider = settings.oidc_provider_config("sso")
    assert provider is not None
    assert provider.issuer == "https://idp.example.test"


def test_multiple_provider_groups_expose_only_enabled_aliases():
    settings = make_oidc_provider_test_settings(
        oidc_sso_issuer="https://sso.example.test/realms/oneflow",
        oidc_sso_client_id="oneflow-sso",
        oidc_sso_client_secret="test-sso-secret",
        oidc_sso_redirect_uri="https://api.oneflow.test/api/v1/auth/oidc/sso/callback",
        oidc_sso_allowed_hosts="keys.example.test",
        oidc_sso_allowed_email_domains="example.test",
    )
    assert settings.enabled_oidc_provider_aliases == ("google", "sso")
    assert settings.oidc_provider_config("microsoft") is None


def test_partial_provider_group_and_legacy_mix_fail_startup():
    with pytest.raises(Exception, match="provider group is incomplete"):
        make_test_settings(oidc_google_issuer="https://accounts.example.test")
    with pytest.raises(Exception, match="cannot be mixed"):
        make_oidc_provider_test_settings(oidc_issuer="https://legacy.example.test")


def test_duplicate_canonical_issuers_and_private_allowlist_hosts_fail_startup():
    duplicate = dict(
        oidc_sso_issuer="https://accounts.example.test/",
        oidc_sso_client_id="oneflow-sso",
        oidc_sso_client_secret="test-sso-secret",
        oidc_sso_redirect_uri="https://api.oneflow.test/api/v1/auth/oidc/sso/callback",
        oidc_sso_allowed_hosts="",
        oidc_sso_allowed_email_domains="example.test",
    )
    with pytest.raises(Exception, match="duplicated"):
        make_oidc_provider_test_settings(**duplicate)
    with pytest.raises(Exception, match="private IP literal"):
        make_oidc_provider_test_settings(oidc_google_allowed_hosts="127.0.0.1")


def test_provider_config_fingerprint_tracks_secret_rotation_without_exposing_it():
    first = make_oidc_provider_test_settings()
    second = make_oidc_provider_test_settings(oidc_google_client_secret="rotated-secret")
    provider = first.oidc_provider_config("google")
    assert provider is not None
    assert provider.config_fingerprint != second.oidc_provider_config("google").config_fingerprint
    assert "test-google-secret" not in repr(provider)


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
                "oidc_redirect_uri": "https://api.example.com/api/v1/auth/oidc/callback",
                "oidc_web_origin": "https://oneflow.example.com",
                "cors_origins": "https://oneflow.example.com",
                "dev_login_password": "test-development-password",
            },
            "only valid in development/test",
        ),
    ],
)
def test_dev_login_password_startup_guards(overrides, message):
    with pytest.raises(Exception, match=message):
        make_test_settings(**overrides)
