"""Project attachment metadata (follow-up collaboration module)."""

import pytest

from tests.conftest import create_project, create_wp


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


async def test_attachment_directory_search_scope_and_complete_summary(client, project):
    pid = project["id"]
    wp = await create_wp(client, pid, subject="연결 작업 알파")
    document = (
        await client.post(
            f"/api/v1/projects/{pid}/documents",
            json={"title": "연결 문서 베타"},
        )
    ).json()
    wp_link = (
        await client.post(
            f"/api/v1/projects/{pid}/attachments",
            json={
                "filename": "recording.url",
                "url": "https://example.com/recording",
                "work_package_id": wp["id"],
            },
        )
    ).json()
    await client.post(
        f"/api/v1/projects/{pid}/attachments",
        json={
            "filename": "notes.url",
            "url": "https://example.com/notes",
            "document_id": document["id"],
        },
    )
    uploaded = await client.post(
        f"/api/v1/projects/{pid}/attachments/upload?filename=report.txt",
        content=b"hello directory",
        headers={"content-type": "text/plain", "content-length": "15"},
    )
    assert uploaded.status_code == 201, uploaded.text

    searched = (
        await client.get(
            f"/api/v1/projects/{pid}/attachments/directory",
            params={"q": "연결 작업 알파"},
        )
    ).json()
    assert searched["total"] == 1
    assert [row["id"] for row in searched["items"]] == [wp_link["id"]]
    assert searched["items"][0]["work_package_subject"] == "연결 작업 알파"
    assert searched["items"][0]["document_title"] is None
    assert searched["summary"] == {
        "total": 3,
        "file_count": 1,
        "link_count": 2,
        "linked_count": 2,
        "indexed_file_count": 1,
        "pending_index_count": 0,
        "used_bytes": 15,
    }

    links = (
        await client.get(
            f"/api/v1/projects/{pid}/attachments/directory",
            params={"scope": "links"},
        )
    ).json()
    assert links["total"] == 2
    assert all(not row["has_file"] for row in links["items"])
    escaped = (
        await client.get(
            f"/api/v1/projects/{pid}/attachments/directory",
            params={"q": "%"},
        )
    ).json()
    assert escaped["total"] == 0


async def test_attachment_directory_cursor_is_stable_and_highlight_is_discoverable(client, project):
    pid = project["id"]
    original_ids = []
    for index in range(5):
        created = await client.post(
            f"/api/v1/projects/{pid}/attachments",
            json={
                "filename": f"cursor-{index}.url",
                "url": f"https://example.com/cursor-{index}",
            },
        )
        original_ids.append(created.json()["id"])

    first = (
        await client.get(
            f"/api/v1/projects/{pid}/attachments/directory",
            params={"q": "cursor-", "limit": 2, "highlight_id": original_ids[0]},
        )
    ).json()
    assert first["total"] == 5
    assert len(first["items"]) == 2
    assert first["next_cursor_created_at"] is not None
    assert first["next_cursor_id"] is not None
    assert first["highlight_item"]["id"] == original_ids[0]

    inserted = await client.post(
        f"/api/v1/projects/{pid}/attachments",
        json={"filename": "cursor-new.url", "url": "https://example.com/cursor-new"},
    )
    assert inserted.status_code == 201

    second = (
        await client.get(
            f"/api/v1/projects/{pid}/attachments/directory",
            params={
                "q": "cursor-",
                "limit": 2,
                "cursor_created_at": first["next_cursor_created_at"],
                "cursor_id": first["next_cursor_id"],
            },
        )
    ).json()
    assert second["total"] == 6
    assert not ({row["id"] for row in first["items"]} & {row["id"] for row in second["items"]})
    assert inserted.json()["id"] not in {row["id"] for row in second["items"]}
    assert second["highlight_item"] is None


async def test_attachment_directory_rejects_half_cursor(client, project):
    response = await client.get(
        f"/api/v1/projects/{project['id']}/attachments/directory",
        params={"cursor_created_at": "2026-07-22T00:00:00Z"},
    )
    assert response.status_code == 422


async def test_project_storage_snapshot(client, project, foreign_project):
    """Pass 57 PR-BW (v57.1): one self-consistent aggregate — stored blobs
    sum into used_bytes, links don't; the SAME function feeds the upload
    quota check (shared-source contract)."""
    pid = project["id"]

    empty = (await client.get(f"/api/v1/projects/{pid}/storage")).json()
    assert empty == {
        "used_bytes": 0,
        "quota_bytes": empty["quota_bytes"],
        "attachment_count": 0,
        "link_count": 0,
    }
    assert empty["quota_bytes"] > 0

    # One real upload + one link-only attachment.
    up = await client.post(
        f"/api/v1/projects/{pid}/attachments/upload?filename=a.txt",
        content=b"hello world",
        headers={"content-type": "application/octet-stream", "content-length": "11"},
    )
    assert up.status_code == 201, up.text
    link = await client.post(
        f"/api/v1/projects/{pid}/attachments",
        json={"filename": "링크", "url": "https://example.com/doc"},
    )
    assert link.status_code == 201, link.text

    body = (await client.get(f"/api/v1/projects/{pid}/storage")).json()
    assert body["used_bytes"] == 11  # blob bytes only — the link adds nothing
    assert (body["attachment_count"], body["link_count"]) == (1, 1)

    # Non-member: existence hidden; archived project stays readable.
    foreign = str(foreign_project["project_id"])
    assert (await client.get(f"/api/v1/projects/{foreign}/storage")).status_code == 404
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (await client.get(f"/api/v1/projects/{pid}/storage")).status_code == 200
    await client.post(f"/api/v1/projects/{pid}/unarchive")
