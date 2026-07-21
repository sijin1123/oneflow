import uuid

from sqlalchemy import select

from app.models import DocumentActivity, ProjectDocument, ProjectMember, User
from tests.conftest import create_project


async def _create_document(client, project_id: str, **overrides) -> dict:
    payload = {
        "title": "운영 가이드",
        "body": "<p>초기 본문</p>",
        "visibility": "shared",
        **overrides,
    }
    response = await client.post(f"/api/v1/projects/{project_id}/documents", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


async def test_document_activity_records_real_mutations_and_paginates(client):
    project = await create_project(client, key="DACT", name="문서 활동")
    document = await _create_document(client, project["id"])

    updated = await client.patch(
        f"/api/v1/documents/{document['id']}",
        json={
            "expected_version": document["version"],
            "title": "운영 가이드 개정",
            "body": "<p>개정 본문</p>",
        },
    )
    assert updated.status_code == 200, updated.text

    no_change = await client.patch(
        f"/api/v1/documents/{document['id']}",
        json={
            "expected_version": updated.json()["version"],
            "title": "운영 가이드 개정",
        },
    )
    assert no_change.status_code == 200, no_change.text

    stale = await client.patch(
        f"/api/v1/documents/{document['id']}",
        json={"expected_version": updated.json()["version"], "title": "저장되면 안 됨"},
    )
    assert stale.status_code == 409

    archived = await client.post(
        f"/api/v1/documents/{document['id']}/archive",
        json={"expected_version": no_change.json()["version"]},
    )
    assert archived.status_code == 200, archived.text
    duplicate_archive = await client.post(
        f"/api/v1/documents/{document['id']}/archive",
        json={"expected_version": archived.json()["version"]},
    )
    assert duplicate_archive.status_code == 200, duplicate_archive.text
    restored = await client.post(
        f"/api/v1/documents/{document['id']}/restore",
        json={"expected_version": duplicate_archive.json()["version"]},
    )
    assert restored.status_code == 200, restored.text

    newest = await client.get(
        f"/api/v1/documents/{document['id']}/activities",
        params={"limit": 2},
    )
    assert newest.status_code == 200, newest.text
    assert newest.json()["total"] == 4
    assert [item["kind"] for item in newest.json()["items"]] == [
        "document_restored",
        "document_archived",
    ]
    assert newest.json()["items"][0]["changed_fields"] == ["archive_state"]

    older = await client.get(
        f"/api/v1/documents/{document['id']}/activities",
        params={"limit": 2, "offset": 2},
    )
    assert older.status_code == 200, older.text
    assert [item["kind"] for item in older.json()["items"]] == [
        "document_updated",
        "document_created",
    ]
    assert older.json()["items"][0]["changed_fields"] == ["body", "title"]
    assert older.json()["items"][1]["changed_fields"] == ["body", "title", "visibility"]
    assert set(older.json()["items"][0]) == {
        "id",
        "actor_id",
        "actor_name",
        "actor_profile_image_url",
        "kind",
        "changed_fields",
        "created_at",
    }
    assert all(item["actor_name"] == "Dev User" for item in newest.json()["items"])
    assert all(item["actor_profile_image_url"] is None for item in newest.json()["items"])


async def test_inline_anchor_body_mutation_is_one_activity(client):
    project = await create_project(client, key="DANC", name="문서 앵커 활동")
    document = await _create_document(client, project["id"], body="<p>본문 문구</p>")
    anchor_id = uuid.uuid4()
    anchored_body = f'<p><span data-comment-anchor="{anchor_id}">본문</span> 문구</p>'

    created = await client.post(
        f"/api/v1/documents/{document['id']}/inline-comments",
        json={
            "body": "첫 메모",
            "anchor_id": str(anchor_id),
            "anchor_quote": "본문",
            "expected_document_version": document["version"],
            "document_body": anchored_body,
        },
    )
    assert created.status_code == 201, created.text

    reply = await client.post(
        f"/api/v1/documents/{document['id']}/inline-comments",
        json={
            "body": "답글",
            "anchor_id": str(anchor_id),
            "anchor_quote": "본문",
        },
    )
    assert reply.status_code == 201, reply.text

    activity = await client.get(f"/api/v1/documents/{document['id']}/activities")
    assert activity.status_code == 200, activity.text
    assert activity.json()["total"] == 2
    assert [item["kind"] for item in activity.json()["items"]] == [
        "document_updated",
        "document_created",
    ]
    assert activity.json()["items"][0]["changed_fields"] == ["body"]


async def test_document_activity_rechecks_visibility_and_preserves_deleted_actor(
    client, app, member_project
):
    async with app.state.sessionmaker() as session, session.begin():
        shared = ProjectDocument(
            project_id=member_project["project_id"],
            title="공유 문서 이력",
            author_id=member_project["owner_id"],
            visibility="shared",
        )
        private = ProjectDocument(
            project_id=member_project["project_id"],
            title="비공개 문서 이력",
            author_id=member_project["owner_id"],
            visibility="private",
        )
        session.add_all([shared, private])
        await session.flush()
        session.add(
            DocumentActivity(
                document_id=shared.id,
                actor_id=member_project["owner_id"],
                actor_name_snapshot="Owner",
                kind="document_created",
                changed_fields=["title", "visibility"],
            )
        )
        shared_id = shared.id
        private_id = private.id

    visible = await client.get(f"/api/v1/documents/{shared_id}/activities")
    assert visible.status_code == 200, visible.text
    assert visible.json()["items"][0]["actor_name"] == "Owner"
    assert (await client.get(f"/api/v1/documents/{private_id}/activities")).status_code == 404

    async with app.state.sessionmaker() as session, session.begin():
        owner = await session.get(User, member_project["owner_id"])
        await session.delete(owner)

    retained = await client.get(f"/api/v1/documents/{shared_id}/activities")
    assert retained.status_code == 200, retained.text
    assert retained.json()["items"][0]["actor_id"] is None
    assert retained.json()["items"][0]["actor_name"] == "Owner"

    async with app.state.sessionmaker() as session, session.begin():
        membership = await session.scalar(
            select(ProjectMember).where(
                ProjectMember.project_id == member_project["project_id"],
                ProjectMember.user_id == member_project["dev_id"],
            )
        )
        await session.delete(membership)

    assert (await client.get(f"/api/v1/documents/{shared_id}/activities")).status_code == 404
