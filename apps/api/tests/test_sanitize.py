"""Rich-text description sanitization (PLAN §3 Phase 1 후속 Tiptap XSS)."""

import pytest

from app.services.sanitize import sanitize_html
from tests.conftest import create_project, create_wp


def test_sanitize_strips_script_and_handlers():
    dirty = '<p onclick="steal()">안녕</p><script>alert(1)</script>'
    clean = sanitize_html(dirty)
    assert "script" not in clean
    assert "onclick" not in clean
    assert "안녕" in clean


def test_sanitize_keeps_allowed_formatting():
    clean = sanitize_html("<p><strong>굵게</strong> 그리고 <em>기울임</em></p>")
    assert "<strong>" in clean and "<em>" in clean


def test_sanitize_rejects_javascript_hrefs():
    clean = sanitize_html('<a href="javascript:alert(1)">클릭</a>')
    assert "javascript:" not in clean
    # a safe link is preserved
    safe = sanitize_html('<a href="https://example.com">링크</a>')
    assert "https://example.com" in safe


def test_sanitize_none_passthrough():
    assert sanitize_html(None) is None


@pytest.fixture
async def project(client):
    return await create_project(client, key="SAN", name="새니타이즈")


async def test_create_sanitizes_description(client, project):
    wp = await create_wp(
        client,
        project["id"],
        subject="XSS 시도",
        description="<p>정상</p><script>alert(1)</script>",
    )
    assert "script" not in (wp["description"] or "")
    assert "정상" in wp["description"]


async def test_patch_sanitizes_description(client, project):
    wp = await create_wp(client, project["id"], subject="패치 XSS")
    patched = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={
            "expected_version": wp["version"],
            "description": '<img src=x onerror="alert(1)"><p>본문</p>',
        },
    )
    assert patched.status_code == 200
    body = patched.json()
    assert "onerror" not in (body["description"] or "")
    assert "본문" in body["description"]
