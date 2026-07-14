"""Auth-mode boundary: OIDC mode requires a validated browser session.

The mode must never fall through to the fixed dev-user auto-provision path.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from tests.conftest import make_oidc_test_settings


@pytest.fixture
async def oidc_client(_prepare_database):
    app = create_app(make_oidc_test_settings())
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await app.state.engine.dispose()


async def test_oidc_mode_requires_login_session(oidc_client):
    # Any endpoint that resolves the current user requires an OIDC session.
    res = await oidc_client.get("/api/v1/projects")
    assert res.status_code == 401


async def test_oidc_mode_leaves_public_health_reachable(oidc_client):
    # Health probes don't resolve a user, so they stay reachable regardless of mode.
    res = await oidc_client.get("/api/v1/healthz")
    assert res.status_code == 200
