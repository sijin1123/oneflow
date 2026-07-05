"""AI summary feature flag + endpoint (PLAN §3 Phase 3 AI/RAG)."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from tests.conftest import create_project, create_wp, make_test_settings


@pytest.fixture
async def ai_client(_clean_tables):
    """A client on an app with the AI summary flag ON (same test DB)."""
    application = create_app(make_test_settings(ai_summary="true"))
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await application.state.engine.dispose()


async def test_capabilities_default_off(client):
    res = await client.get("/api/v1/capabilities")
    assert res.status_code == 200
    assert res.json()["ai_summary_enabled"] is False


async def test_summary_disabled_returns_503(client):
    proj = await create_project(client, key="AI", name="AI")
    wp = await create_wp(client, proj["id"], subject="요약 대상")
    res = await client.post(f"/api/v1/work-packages/{wp['id']}/summary")
    assert res.status_code == 503


async def test_capabilities_on_when_flag_enabled(ai_client):
    res = await ai_client.get("/api/v1/capabilities")
    assert res.json()["ai_summary_enabled"] is True


async def test_summary_when_enabled(ai_client):
    proj = await create_project(ai_client, key="AI", name="AI")
    wp = await create_wp(
        ai_client, proj["id"], subject="로그인 버그 수정", priority="high", type="bug"
    )
    res = await ai_client.post(f"/api/v1/work-packages/{wp['id']}/summary")
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "local-extractive"
    assert body["work_package_id"] == wp["id"]
    assert "로그인 버그 수정" in body["summary"]
    assert "버그" in body["summary"]  # type label present


async def test_summary_member_scoped_when_enabled(ai_client, foreign_project):
    res = await ai_client.post(f"/api/v1/work-packages/{foreign_project['wp_id']}/summary")
    assert res.status_code == 404
