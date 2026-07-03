"""Startup / seed / loopback guards (§9)."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.seed import SeedGuardError, check_env_guard, check_reset_guard
from tests.conftest import TEST_URL, make_test_settings


def _expect_invalid(**kwargs):
    with pytest.raises(ValidationError):
        make_test_settings(**kwargs)


def test_env_whitelist():
    _expect_invalid(env="prod")  # not an allowed literal


@pytest.mark.parametrize("env", ["staging", "production"])
def test_dev_auth_forbidden_outside_dev_test(env):
    _expect_invalid(env=env, auth_mode="dev")


def test_oidc_allowed_in_production():
    s = Settings(
        env="production", auth_mode="oidc", database_url=TEST_URL, test_database_url=TEST_URL
    )
    assert s.auth_mode == "oidc"


def test_db_scheme_guard():
    _expect_invalid(database_url="postgresql://oneflow:oneflow@localhost:5432/oneflow")


def test_cors_guard():
    _expect_invalid(cors_origins="not-a-url")
    _expect_invalid(cors_origins="ftp://example.com")


def test_log_level_guard():
    _expect_invalid(log_level="TRACE")


def test_dev_allow_nonlocal_strict_parse():
    _expect_invalid(dev_allow_nonlocal="TRUE")  # exactly "true" only
    _expect_invalid(dev_allow_nonlocal="1")
    assert make_test_settings(dev_allow_nonlocal="true").dev_allow_nonlocal_enabled


def test_dev_allow_nonlocal_forbidden_outside_dev_test():
    _expect_invalid(env="production", auth_mode="oidc", dev_allow_nonlocal="true")


# --- dev loopback middleware (v5.1, §9 guard 4) ---


async def test_loopback_client_allowed(client):
    res = await client.get("/api/v1/projects")
    assert res.status_code == 200


async def test_nonlocal_client_403(nonlocal_client):
    res = await nonlocal_client.get("/api/v1/projects")
    assert res.status_code == 403
    assert res.json() == {"detail": "dev auth is loopback-only"}


async def test_nonlocal_probe_paths_exempt(nonlocal_client):
    assert (await nonlocal_client.get("/api/v1/healthz")).status_code == 200
    assert (await nonlocal_client.get("/api/v1/health")).status_code == 200


async def test_nonlocal_allowed_with_escape_hatch():
    from httpx import ASGITransport, AsyncClient

    from app.main import create_app

    app = create_app(make_test_settings(dev_allow_nonlocal="true"))
    try:
        transport = ASGITransport(app=app, client=("10.9.8.7", 40000))
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            res = await c.get("/api/v1/healthz")
            assert res.status_code == 200
            res = await c.get("/api/v1/projects")
            assert res.status_code == 200
    finally:
        await app.state.engine.dispose()


# --- seed guards (§9) ---


def test_seed_env_guard_blocks_staging_production():
    for env in ("staging", "production"):
        with pytest.raises(SeedGuardError):
            check_env_guard(
                Settings(
                    env=env, auth_mode="oidc", database_url=TEST_URL, test_database_url=TEST_URL
                )
            )


def test_reset_allows_local_test_db():
    check_reset_guard(make_test_settings(), TEST_URL)  # no raise


def test_reset_refuses_remote_host_even_for_test_db():
    with pytest.raises(SeedGuardError):
        check_reset_guard(
            make_test_settings(),
            "postgresql+asyncpg://u:p@db.internal.corp:5432/oneflow_test",
        )


def test_reset_refuses_ssl_dsn():
    with pytest.raises(SeedGuardError):
        check_reset_guard(
            make_test_settings(),
            "postgresql+asyncpg://u:p@localhost:5432/oneflow_test?ssl=require",
        )


def test_reset_nontest_requires_token():
    with pytest.raises(SeedGuardError):
        check_reset_guard(
            make_test_settings(),
            "postgresql+asyncpg://oneflow:oneflow@localhost:5432/oneflow",
        )


def test_reset_nontest_with_token_and_default_name():
    s = make_test_settings(allow_destructive_reset="local-dev-only")
    check_reset_guard(s, "postgresql+asyncpg://oneflow:oneflow@localhost:5432/oneflow")  # ok
    with pytest.raises(SeedGuardError):  # wrong non-test name refused even with token
        check_reset_guard(s, "postgresql+asyncpg://oneflow:oneflow@localhost:5432/mydb")


def test_reset_token_must_match_exactly():
    s = make_test_settings(allow_destructive_reset="yes")
    with pytest.raises(SeedGuardError):
        check_reset_guard(s, "postgresql+asyncpg://oneflow:oneflow@localhost:5432/oneflow")
