"""Project documents / wiki (follow-up collaboration module)."""

import pytest

from tests.conftest import create_project


@pytest.fixture
async def project(client):
    return await create_project(client, key="DOC", name="문서")


async def test_document_crud_roundtrip(client, project):
    pid = project["id"]
    created = await client.post(
        f"/api/v1/projects/{pid}/documents",
        json={"title": "  회의록 템플릿  ", "body": "<p>본문</p>"},
    )
    assert created.status_code == 201
    doc = created.json()
    assert doc["title"] == "회의록 템플릿"  # trimmed
    assert doc["version"] == 0

    listed = (await client.get(f"/api/v1/projects/{pid}/documents")).json()
    assert listed["total"] == 1
    assert "body" not in listed["items"][0]  # list omits body

    fetched = (await client.get(f"/api/v1/documents/{doc['id']}")).json()
    assert fetched["body"] == "<p>본문</p>"

    assert (await client.delete(f"/api/v1/documents/{doc['id']}")).status_code == 204
    assert (await client.get(f"/api/v1/projects/{pid}/documents")).json()["total"] == 0


async def test_document_body_is_sanitized(client, project):
    pid = project["id"]
    created = await client.post(
        f"/api/v1/projects/{pid}/documents",
        json={"title": "XSS", "body": "<p>ok</p><script>alert(1)</script>"},
    )
    assert "script" not in (created.json()["body"] or "")


async def test_document_update_bumps_version_and_sanitizes(client, project):
    pid = project["id"]
    doc = (await client.post(f"/api/v1/projects/{pid}/documents", json={"title": "T"})).json()
    patched = await client.patch(
        f"/api/v1/documents/{doc['id']}",
        json={
            "expected_version": 0,
            "title": "T2",
            "body": '<img src=x onerror="x"><p>내용</p>',
        },
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["version"] == 1
    assert body["title"] == "T2"
    assert "onerror" not in (body["body"] or "")


async def test_document_stale_update_conflicts(client, project):
    pid = project["id"]
    doc = (await client.post(f"/api/v1/projects/{pid}/documents", json={"title": "T"})).json()
    # bump to v1
    await client.patch(
        f"/api/v1/documents/{doc['id']}", json={"expected_version": 0, "title": "T1"}
    )
    # stale editor still on v0 → 409 with current
    conflict = await client.patch(
        f"/api/v1/documents/{doc['id']}", json={"expected_version": 0, "title": "T-stale"}
    )
    assert conflict.status_code == 409
    assert conflict.json()["current"]["version"] == 1


async def test_documents_are_member_scoped(client, foreign_project):
    pid = foreign_project["project_id"]
    assert (await client.get(f"/api/v1/projects/{pid}/documents")).status_code == 404
    assert (
        await client.post(f"/api/v1/projects/{pid}/documents", json={"title": "x"})
    ).status_code == 404
