"""AI summary deployment ceiling, workspace policy, and endpoint."""

import asyncio

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


async def test_ai_policy_rejects_enable_when_deployment_ceiling_is_off(client):
    policy = await client.get("/api/v1/admin/workspace/features/ai")
    assert policy.status_code == 200
    assert policy.headers["etag"] == '"1"'
    assert policy.json()["enabled"] is False
    assert policy.json()["deployment_enabled"] is False
    assert policy.json()["effective_enabled"] is False

    blocked = await client.patch(
        "/api/v1/admin/workspace/features/ai",
        json={"enabled": True},
        headers={"If-Match": '"1"'},
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"] == {
        "code": "ai_deployment_disabled",
        "feature": "ai",
    }
    current = await client.get("/api/v1/admin/workspace/features/ai")
    assert current.json()["revision"] == 1
    assert current.json()["updated_by_user_id"] is None


async def test_summary_disabled_returns_503(client):
    proj = await create_project(client, key="AI", name="AI")
    wp = await create_wp(client, proj["id"], subject="요약 대상")
    res = await client.post(f"/api/v1/work-packages/{wp['id']}/summary")
    assert res.status_code == 503


async def test_capabilities_on_when_flag_enabled(ai_client):
    initial = await ai_client.get("/api/v1/admin/workspace/features/ai")
    assert initial.json()["deployment_enabled"] is True
    assert initial.json()["effective_enabled"] is False
    enabled = await ai_client.patch(
        "/api/v1/admin/workspace/features/ai",
        json={"enabled": True},
        headers={"If-Match": '"1"'},
    )
    assert enabled.status_code == 200, enabled.text
    assert enabled.headers["etag"] == '"2"'
    assert enabled.json()["effective_enabled"] is True
    assert enabled.json()["updated_by_name"] == "Dev User"
    res = await ai_client.get("/api/v1/capabilities")
    assert res.json()["ai_summary_enabled"] is True


async def test_summary_when_enabled(ai_client):
    enabled = await ai_client.patch(
        "/api/v1/admin/workspace/features/ai",
        json={"enabled": True},
        headers={"If-Match": '"1"'},
    )
    assert enabled.status_code == 200
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


async def test_summary_answers_bounded_question_when_enabled(ai_client):
    enabled = await ai_client.patch(
        "/api/v1/admin/workspace/features/ai",
        json={"enabled": True},
        headers={"If-Match": '"1"'},
    )
    assert enabled.status_code == 200
    proj = await create_project(ai_client, key="ASK", name="Ask")
    wp = await create_wp(
        ai_client,
        proj["id"],
        subject="릴리스 점검",
        priority="urgent",
        due_date="2026-07-31",
    )

    due = await ai_client.post(
        f"/api/v1/work-packages/{wp['id']}/summary",
        json={"question": "  이 작업의 기한은 언제인가요?  "},
    )
    assert due.status_code == 200
    assert "2026-07-31" in due.json()["summary"]

    fallback = await ai_client.post(
        f"/api/v1/work-packages/{wp['id']}/summary",
        json={"question": "누가 최종 승인하나요?"},
    )
    assert fallback.status_code == 200
    assert "질문의 범위를 완전히 해석하지 못해" in fallback.json()["summary"]

    too_long = await ai_client.post(
        f"/api/v1/work-packages/{wp['id']}/summary",
        json={"question": "가" * 501},
    )
    assert too_long.status_code == 422


async def test_summary_member_scoped_when_enabled(ai_client, foreign_project):
    enabled = await ai_client.patch(
        "/api/v1/admin/workspace/features/ai",
        json={"enabled": True},
        headers={"If-Match": '"1"'},
    )
    assert enabled.status_code == 200
    res = await ai_client.post(f"/api/v1/work-packages/{foreign_project['wp_id']}/summary")
    assert res.status_code == 404


async def test_ai_policy_compare_and_swap_allows_one_writer(ai_client):
    async def enable():
        return await ai_client.patch(
            "/api/v1/admin/workspace/features/ai",
            json={"enabled": True},
            headers={"If-Match": '"1"'},
        )

    first, second = await asyncio.gather(enable(), enable())
    assert sorted([first.status_code, second.status_code]) == [200, 412]
    policy = await ai_client.get("/api/v1/admin/workspace/features/ai")
    assert policy.json()["revision"] == 2
    assert policy.json()["effective_enabled"] is True
