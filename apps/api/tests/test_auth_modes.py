"""Auth-mode boundary (PLAN §5): oidc mode must 501, never a silent dev bypass.

fable5 audit: config-level guards were tested, but no test asserted that a running
app in oidc mode refuses authenticated requests with 501 instead of falling through
to the dev-user auto-provision path.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from tests.conftest import make_test_settings


@pytest.fixture
async def oidc_client(_prepare_database):
    app = create_app(
        make_test_settings(
            auth_mode="oidc",
            oidc_issuer="https://idp.example.com/realms/test",
            oidc_client_id="oneflow-web",
            oidc_client_secret="test-secret",
        )
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await app.state.engine.dispose()


async def test_oidc_mode_rejects_authenticated_request_501(oidc_client):
    # Any endpoint that resolves the current user must 501 under oidc mode.
    res = await oidc_client.get("/api/v1/projects")
    assert res.status_code == 501


async def test_oidc_mode_leaves_public_health_reachable(oidc_client):
    # Health probes don't resolve a user, so they stay reachable regardless of mode.
    res = await oidc_client.get("/api/v1/healthz")
    assert res.status_code == 200
