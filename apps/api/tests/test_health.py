"""Probe contract tests (§6.1): healthz=liveness(no DB), health=readiness(DB ping)."""

from app.db.session import get_session


class _BrokenSession:
    async def execute(self, *_args, **_kwargs):
        raise RuntimeError("simulated database outage")


async def _broken_session():
    yield _BrokenSession()


async def test_healthz_alive(client):
    res = await client.get("/api/v1/healthz")
    assert res.status_code == 200
    assert res.json() == {"status": "alive"}


async def test_health_ok(client):
    res = await client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "database": "ok"}


async def test_db_down_healthz_still_200_health_503(app, client):
    # The ONLY intended exception to the real-DB rule (§5): DB-down is simulated
    # by overriding the session dependency with a raising stub.
    app.dependency_overrides[get_session] = _broken_session
    try:
        alive = await client.get("/api/v1/healthz")
        ready = await client.get("/api/v1/health")
    finally:
        del app.dependency_overrides[get_session]
    assert alive.status_code == 200  # liveness must not couple to the DB
    assert ready.status_code == 503
    assert ready.json() == {"status": "degraded", "database": "error"}
