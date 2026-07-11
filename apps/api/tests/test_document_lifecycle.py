from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.auth import DEV_USER_EMAIL, token_hash
from app.models.access_token import PersonalAccessToken
from app.models.member import ProjectMember
from app.models.user import User
from tests.conftest import create_project, create_wp


@pytest.fixture
async def project(client):
    return await create_project(client, key="WLC", name="Wiki lifecycle")


@pytest.fixture
async def other(app, project):
    raw = "ofp_private_author_token"
    async with app.state.sessionmaker() as session, session.begin():
        user = User(email="author@oneflow.local", display_name="Private Author")
        session.add(user)
        await session.flush()
        session.add_all(
            [
                ProjectMember(project_id=project["id"], user_id=user.id, role="member"),
                PersonalAccessToken(
                    user_id=user.id,
                    name="test",
                    token_hash=token_hash(raw),
                    token_prefix=raw[:12],
                    expires_at=datetime.now(UTC) + timedelta(days=1),
                ),
            ]
        )
        return {"id": str(user.id), "headers": {"Authorization": f"Bearer {raw}"}}


async def _create(client, project_id, title, *, headers=None, visibility="shared", parent_id=None):
    response = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        headers=headers,
        json={"title": title, "visibility": visibility, "parent_id": parent_id},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_private_document_is_author_only_across_reads(client, project, other):
    private = await _create(
        client,
        project["id"],
        "Secret roadmap",
        headers=other["headers"],
        visibility="private",
    )
    shared = await _create(client, project["id"], "Shared roadmap")

    assert (await client.get(f"/api/v1/documents/{private['id']}")).status_code == 404
    assert (await client.get(f"/api/v1/documents/{shared['id']}")).status_code == 200
    assert (await client.get(f"/api/v1/projects/{project['id']}/documents?bucket=private")).json()[
        "total"
    ] == 0
    own_private = await client.get(
        f"/api/v1/projects/{project['id']}/documents?bucket=private", headers=other["headers"]
    )
    assert [item["id"] for item in own_private.json()["items"]] == [private["id"]]

    hidden_search = await client.get("/api/v1/search?q=Secret%20roadmap")
    assert hidden_search.json()["documents"]["returned"] == 0
    own_search = await client.get("/api/v1/search?q=Secret%20roadmap", headers=other["headers"])
    assert own_search.json()["documents"]["returned"] == 1


async def test_private_links_and_attachments_do_not_leak(client, project, other):
    private = await _create(
        client,
        project["id"],
        "Private links",
        headers=other["headers"],
        visibility="private",
    )
    wp = await create_wp(client, project["id"], subject="Linked work")
    link = await client.post(
        f"/api/v1/documents/{private['id']}/work-package-links",
        headers=other["headers"],
        json={"work_package_id": wp["id"]},
    )
    assert link.status_code == 201
    hidden_links = await client.get(f"/api/v1/work-packages/{wp['id']}/documents")
    assert hidden_links.json()["total"] == 0

    attachment = await client.post(
        f"/api/v1/projects/{project['id']}/attachments",
        headers=other["headers"],
        json={
            "filename": "private.txt",
            "url": "https://files.example/private.txt",
            "document_id": private["id"],
        },
    )
    assert attachment.status_code == 201
    broad = await client.get(f"/api/v1/projects/{project['id']}/attachments")
    assert attachment.json()["id"] not in {item["id"] for item in broad.json()["items"]}
    direct = await client.get(
        f"/api/v1/projects/{project['id']}/attachments?document_id={private['id']}"
    )
    assert direct.json()["total"] == 0
    deleted = await client.delete(f"/api/v1/attachments/{attachment.json()['id']}")
    assert deleted.status_code == 404

    uploaded = await client.post(
        f"/api/v1/projects/{project['id']}/attachments/upload"
        f"?filename=private-upload.txt&document_id={private['id']}",
        headers=other["headers"],
        content=b"private file body",
    )
    assert uploaded.status_code == 201, uploaded.text
    assert (
        await client.get(f"/api/v1/attachments/{uploaded.json()['id']}/download")
    ).status_code == 404
    own_download = await client.get(
        f"/api/v1/attachments/{uploaded.json()['id']}/download", headers=other["headers"]
    )
    assert own_download.status_code == 200
    assert own_download.content == b"private file body"

    hidden_storage = (await client.get(f"/api/v1/projects/{project['id']}/storage")).json()
    hidden_counts = (
        hidden_storage["used_bytes"],
        hidden_storage["attachment_count"],
        hidden_storage["link_count"],
    )
    assert hidden_counts == (0, 0, 0)
    own_storage = (
        await client.get(f"/api/v1/projects/{project['id']}/storage", headers=other["headers"])
    ).json()
    own_counts = (
        own_storage["used_bytes"],
        own_storage["attachment_count"],
        own_storage["link_count"],
    )
    assert own_counts == (
        len(b"private file body"),
        1,
        1,
    )

    target = await create_project(client, key="WLT", name="Wiki lifecycle target")
    move_preview = await client.post(
        f"/api/v1/work-packages/{wp['id']}/move",
        json={
            "target_project_id": target["id"],
            "expected_version": wp["version"],
            "dry_run": True,
        },
    )
    assert move_preview.status_code == 200, move_preview.text
    assert move_preview.json()["cleared"]["document_links"] == {
        "count": 0,
        "names": [],
        "overflow": 0,
    }


async def test_archive_restore_cas_and_read_only(client, project, other):
    private = await _create(
        client,
        project["id"],
        "Archive me",
        headers=other["headers"],
        visibility="private",
    )
    archived = await client.post(
        f"/api/v1/documents/{private['id']}/archive",
        headers=other["headers"],
        json={"expected_version": private["version"]},
    )
    assert archived.status_code == 200, archived.text
    archived_doc = archived.json()
    assert archived_doc["archived_at"] is not None
    assert archived_doc["archived_by_name"] == "Private Author"
    assert (
        await client.post(
            f"/api/v1/documents/{private['id']}/comments",
            headers=other["headers"],
            json={"body": "blocked"},
        )
    ).status_code == 409

    stale = await client.post(
        f"/api/v1/documents/{private['id']}/restore",
        headers=other["headers"],
        json={"expected_version": private["version"]},
    )
    assert stale.status_code == 409
    restored = await client.post(
        f"/api/v1/documents/{private['id']}/restore",
        headers=other["headers"],
        json={"expected_version": archived_doc["version"]},
    )
    assert restored.status_code == 200
    assert restored.json()["archived_at"] is None


async def test_shared_lifecycle_allows_author_or_owner_only(client, project, other):
    owner_authored = await _create(client, project["id"], "Owner authored")
    denied = await client.post(
        f"/api/v1/documents/{owner_authored['id']}/archive",
        headers=other["headers"],
        json={"expected_version": owner_authored["version"]},
    )
    assert denied.status_code == 404

    member_authored = await _create(
        client, project["id"], "Member authored", headers=other["headers"]
    )
    owner_archive = await client.post(
        f"/api/v1/documents/{member_authored['id']}/archive",
        json={"expected_version": member_authored["version"]},
    )
    assert owner_archive.status_code == 200
    assert owner_archive.json()["archived_at"] is not None

    visibility_change = await client.patch(
        f"/api/v1/documents/{owner_authored['id']}",
        headers=other["headers"],
        json={"expected_version": owner_authored["version"], "visibility": "private"},
    )
    assert visibility_change.status_code == 404


async def test_hierarchy_requires_same_visibility(client, project, other):
    shared = await _create(client, project["id"], "Shared parent")
    response = await client.post(
        f"/api/v1/projects/{project['id']}/documents",
        headers=other["headers"],
        json={"title": "Private child", "visibility": "private", "parent_id": shared["id"]},
    )
    assert response.status_code == 422


async def test_member_with_private_documents_cannot_be_removed(client, app, project, other):
    await _create(
        client,
        project["id"],
        "Offboarding blocker",
        headers=other["headers"],
        visibility="private",
    )
    response = await client.delete(f"/api/v1/projects/{project['id']}/members/{other['id']}")
    assert response.status_code == 409
    async with app.state.sessionmaker() as session:
        dev = (await session.execute(select(User).where(User.email == DEV_USER_EMAIL))).scalar_one()
        assert dev.is_admin is True
