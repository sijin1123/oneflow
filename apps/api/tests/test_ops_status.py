"""Operations status surface (expansion PLAN Pass 26 PR-AR).

Contract (v26.1): always 200 (human observability — machine probes unchanged);
counts are CALLER-scoped and best-effort; the response is a strict allowlist —
injected secrets can never appear anywhere in the payload."""

import json

from app.api.v1 import ops
from tests.conftest import create_project, create_wp


async def test_status_shape_and_scoped_counts(client, foreign_project):
    project = await create_project(client, key="OPS", name="상태 프로젝트")
    await create_wp(client, project["id"], subject="상태 확인")

    res = await client.get("/api/v1/ops/status")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["version"]
    readiness = body["readiness"]
    assert readiness["status"] == "warning"  # dev auth is not shared-deployment ready
    assert readiness["ok"] == 3
    assert readiness["warnings"] == 1
    assert readiness["errors"] == 0
    assert [check["id"] for check in readiness["checks"]] == [
        "database",
        "schema",
        "storage",
        "auth",
    ]
    assert body["database"]["status"] == "ok"
    assert body["database"]["current_revision"] == ops.EXPECTED_DB_REVISION
    assert body["database"]["matches_head"] is True
    # Caller scope: the foreign project (dev is not a member) never counts.
    assert body["counts"]["projects"] == 1
    assert body["counts"]["work_packages"] == 1
    cfg = body["config"]
    assert cfg["environment"] == "test"
    assert cfg["auth_mode"] == "dev"
    assert cfg["oidc_provider_count"] == 0
    assert isinstance(cfg["ai_summary_enabled"], bool)
    assert cfg["storage_backend"] == "local"
    assert cfg["upload_max_bytes"] > 0


async def test_no_secret_ever_rides_along(client, app):
    """Allowlist defense (v26.1 R1-⑤): plant a fake secret in settings and
    assert the FULL serialized response never contains it."""
    settings = app.state.settings
    planted = "super-secret-value-xyz"
    original = getattr(settings, "oidc_client_secret", None)
    try:
        object.__setattr__(settings, "oidc_client_secret", planted)
        res = await client.get("/api/v1/ops/status")
        assert planted not in json.dumps(res.json())
        assert "postgresql" not in json.dumps(res.json())  # no DSN either
        assert settings.storage_dir not in json.dumps(res.json())  # no filesystem path
    finally:
        object.__setattr__(settings, "oidc_client_secret", original)


async def test_storage_failure_is_reported_without_breaking_status(client, monkeypatch):
    def fail_probe(_root: str) -> None:
        raise PermissionError("/private/deployment/path")

    monkeypatch.setattr(ops, "_probe_local_storage", fail_probe)
    res = await client.get("/api/v1/ops/status")
    assert res.status_code == 200
    body = res.json()
    assert body["readiness"]["status"] == "error"
    storage = next(check for check in body["readiness"]["checks"] if check["id"] == "storage")
    assert storage["status"] == "error"
    assert storage["observed"] == "unavailable"
    assert "/private" not in json.dumps(body)


async def test_schema_mismatch_is_a_real_readiness_error(client, monkeypatch):
    monkeypatch.setattr(ops, "EXPECTED_DB_REVISION", "future-head")
    res = await client.get("/api/v1/ops/status")
    assert res.status_code == 200
    body = res.json()
    schema = next(check for check in body["readiness"]["checks"] if check["id"] == "schema")
    assert schema["status"] == "error"
    assert schema["observed"] != schema["expected"]
    assert body["database"]["matches_head"] is False
