import uuid

from sqlalchemy import select

from app.models import DocumentRevision, ProjectDocument, ProjectMember, User
from tests.conftest import create_project


async def _create_document(client, project_id: str, **overrides) -> dict:
    response = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "운영 가이드",
            "body": "<p>초기 본문</p>",
            "visibility": "shared",
            **overrides,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_document_revisions_list_preview_restore_and_conflict(client):
    project = await create_project(client, key="DREV", name="문서 버전")
    document = await _create_document(client, project["id"])

    initial = await client.get(f"/api/v1/documents/{document['id']}/revisions")
    assert initial.status_code == 200, initial.text
    assert initial.json()["total"] == 1
    initial_revision = initial.json()["items"][0]
    assert initial.json()["current_revision_id"] == initial_revision["id"]
    assert initial_revision["document_version"] == 0
    assert initial_revision["changed_fields"] == ["body", "title"]
    assert initial_revision["actor_name"] == "Dev User"

    preview = await client.get(
        f"/api/v1/documents/{document['id']}/revisions/{initial_revision['id']}"
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["title"] == "운영 가이드"
    assert preview.json()["body"] == "<p>초기 본문</p>"

    updated = await client.patch(
        f"/api/v1/documents/{document['id']}",
        json={
            "expected_version": 0,
            "title": "운영 가이드 개정",
            "body": "<p>개정 본문</p>",
        },
    )
    assert updated.status_code == 200, updated.text

    # A visibility-only mutation advances the object CAS without duplicating content history.
    private = await client.patch(
        f"/api/v1/documents/{document['id']}",
        json={"expected_version": 1, "visibility": "private"},
    )
    assert private.status_code == 200, private.text
    assert private.json()["version"] == 2

    page = await client.get(
        f"/api/v1/documents/{document['id']}/revisions",
        params={"limit": 1, "offset": 1},
    )
    assert page.status_code == 200, page.text
    assert page.json()["total"] == 2
    assert page.json()["items"][0]["id"] == initial_revision["id"]
    assert page.json()["current_revision_id"] != initial_revision["id"]

    restored = await client.post(
        f"/api/v1/documents/{document['id']}/revisions/{initial_revision['id']}/restore",
        json={"expected_version": 2},
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["version"] == 3
    assert restored.json()["title"] == "운영 가이드"
    assert restored.json()["body"] == "<p>초기 본문</p>"
    assert restored.json()["visibility"] == "private"

    history = (await client.get(f"/api/v1/documents/{document['id']}/revisions")).json()
    assert history["total"] == 3
    restored_revision = history["items"][0]
    assert history["current_revision_id"] == restored_revision["id"]
    assert restored_revision["document_version"] == 3
    assert restored_revision["restored_from_revision_id"] == initial_revision["id"]
    assert restored_revision["changed_fields"] == ["body", "title"]

    activity = (await client.get(f"/api/v1/documents/{document['id']}/activities")).json()
    assert activity["items"][0]["kind"] == "document_version_restored"
    assert activity["items"][0]["changed_fields"] == ["body", "title"]

    stale = await client.post(
        f"/api/v1/documents/{document['id']}/revisions/{initial_revision['id']}/restore",
        json={"expected_version": 2},
    )
    assert stale.status_code == 409
    assert stale.json()["current"]["version"] == 3
    assert (await client.get(f"/api/v1/documents/{document['id']}/revisions")).json()["total"] == 3

    no_op = await client.post(
        f"/api/v1/documents/{document['id']}/revisions/{restored_revision['id']}/restore",
        json={"expected_version": 3},
    )
    assert no_op.status_code == 200, no_op.text
    assert no_op.json()["version"] == 3
    assert (await client.get(f"/api/v1/documents/{document['id']}/revisions")).json()["total"] == 3

    archived = await client.post(
        f"/api/v1/documents/{document['id']}/archive",
        json={"expected_version": 3},
    )
    assert archived.status_code == 200, archived.text
    blocked = await client.post(
        f"/api/v1/documents/{document['id']}/revisions/{initial_revision['id']}/restore",
        json={"expected_version": 4},
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"] == "archived document is read-only"


async def test_inline_body_change_creates_revision_but_reply_does_not(client):
    project = await create_project(client, key="DRIN", name="문서 인라인 버전")
    document = await _create_document(client, project["id"], body="<p>본문 문구</p>")
    anchor_id = uuid.uuid4()
    anchored_body = f'<p><span data-comment-anchor="{anchor_id}">본문</span> 문구</p>'

    created = await client.post(
        f"/api/v1/documents/{document['id']}/inline-comments",
        json={
            "body": "첫 메모",
            "anchor_id": str(anchor_id),
            "anchor_quote": "본문",
            "expected_document_version": 0,
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

    revisions = (await client.get(f"/api/v1/documents/{document['id']}/revisions")).json()
    assert revisions["total"] == 2
    assert revisions["items"][0]["document_version"] == 1
    assert revisions["items"][0]["changed_fields"] == ["body"]


async def test_revision_visibility_actor_and_write_boundaries(client, app, member_project):
    async with app.state.sessionmaker() as session, session.begin():
        shared = ProjectDocument(
            project_id=member_project["project_id"],
            title="공유 문서 버전",
            body="<p>공유</p>",
            author_id=member_project["owner_id"],
            visibility="shared",
        )
        private = ProjectDocument(
            project_id=member_project["project_id"],
            title="비공개 문서 버전",
            body="<p>비공개</p>",
            author_id=member_project["owner_id"],
            visibility="private",
        )
        session.add_all([shared, private])
        await session.flush()
        shared_revision = DocumentRevision(
            document_id=shared.id,
            document_version=0,
            actor_id=member_project["owner_id"],
            title=shared.title,
            body=shared.body,
            changed_fields=["body", "title"],
        )
        private_revision = DocumentRevision(
            document_id=private.id,
            document_version=0,
            actor_id=member_project["owner_id"],
            title=private.title,
            body=private.body,
            changed_fields=["body", "title"],
        )
        session.add_all([shared_revision, private_revision])
        await session.flush()
        shared_id = shared.id
        shared_revision_id = shared_revision.id
        private_id = private.id

    visible = await client.get(f"/api/v1/documents/{shared_id}/revisions")
    assert visible.status_code == 200, visible.text
    assert visible.json()["items"][0]["actor_name"] == "Owner"
    assert (await client.get(f"/api/v1/documents/{private_id}/revisions")).status_code == 404

    async with app.state.sessionmaker() as session, session.begin():
        owner = await session.get(User, member_project["owner_id"])
        await session.delete(owner)

    retained = await client.get(f"/api/v1/documents/{shared_id}/revisions")
    assert retained.status_code == 200, retained.text
    assert retained.json()["items"][0]["actor_id"] is None
    assert retained.json()["items"][0]["actor_name"] is None

    async with app.state.sessionmaker() as session, session.begin():
        membership = await session.scalar(
            select(ProjectMember).where(
                ProjectMember.project_id == member_project["project_id"],
                ProjectMember.user_id == member_project["dev_id"],
            )
        )
        membership.role = "viewer"

    read_only = await client.post(
        f"/api/v1/documents/{shared_id}/revisions/{shared_revision_id}/restore",
        json={"expected_version": 0},
    )
    assert read_only.status_code == 403

    async with app.state.sessionmaker() as session, session.begin():
        membership = await session.scalar(
            select(ProjectMember).where(
                ProjectMember.project_id == member_project["project_id"],
                ProjectMember.user_id == member_project["dev_id"],
            )
        )
        await session.delete(membership)

    assert (await client.get(f"/api/v1/documents/{shared_id}/revisions")).status_code == 404
