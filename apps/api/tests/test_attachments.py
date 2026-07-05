"""Project attachment metadata (follow-up collaboration module)."""

import pytest

from tests.conftest import create_project


@pytest.fixture
async def project(client):
    return await create_project(client, key="ATT", name="첨부")


async def test_attachment_crud(client, project):
    pid = project["id"]
    created = await client.post(
        f"/api/v1/projects/{pid}/attachments",
        json={
            "filename": "  설계서.pdf  ",
            "url": "https://files.example.com/a.pdf",
            "content_type": "application/pdf",
            "size_bytes": 12345,
        },
    )
    assert created.status_code == 201
    att = created.json()
    assert att["filename"] == "설계서.pdf"  # trimmed
    assert att["size_bytes"] == 12345

    listed = (await client.get(f"/api/v1/projects/{pid}/attachments")).json()
    assert listed["total"] == 1

    assert (await client.delete(f"/api/v1/attachments/{att['id']}")).status_code == 204
    assert (await client.get(f"/api/v1/projects/{pid}/attachments")).json()["total"] == 0


async def test_attachment_rejects_non_http_url(client, project):
    pid = project["id"]
    for bad in ("javascript:alert(1)", "file:///etc/passwd", "not-a-url"):
        res = await client.post(
            f"/api/v1/projects/{pid}/attachments",
            json={"filename": "x", "url": bad},
        )
        assert res.status_code == 422, bad


async def test_attachment_minimal_fields(client, project):
    pid = project["id"]
    res = await client.post(
        f"/api/v1/projects/{pid}/attachments",
        json={"filename": "메모.txt", "url": "http://example.com/memo"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["content_type"] is None and body["size_bytes"] is None


async def test_attachments_are_member_scoped(client, foreign_project):
    pid = foreign_project["project_id"]
    assert (await client.get(f"/api/v1/projects/{pid}/attachments")).status_code == 404
    assert (
        await client.post(
            f"/api/v1/projects/{pid}/attachments",
            json={"filename": "x", "url": "https://example.com/x"},
        )
    ).status_code == 404


async def test_delete_unknown_attachment_404(client, project):
    missing = "00000000-0000-4000-8000-000000000000"
    assert (await client.delete(f"/api/v1/attachments/{missing}")).status_code == 404
