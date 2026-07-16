"""Structured mentions and first-class Document inbox targets (UI-125)."""

import uuid

from sqlalchemy import delete as sa_delete
from sqlalchemy import select

from app.models.document import ProjectDocument
from app.models.member import ProjectMember
from app.models.notification import Notification
from app.models.notification_setting import UserNotificationSettings


async def create_document(client, project_id, *, visibility="shared"):
    response = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={"title": "멘션 문서", "body": "<p>검토 문구</p>", "visibility": visibility},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def notifications_for(app, user_id):
    async with app.state.sessionmaker() as session:
        return list(
            (
                await session.execute(
                    select(Notification)
                    .where(
                        Notification.user_id == user_id,
                        Notification.kind == "document_mention",
                    )
                    .order_by(Notification.created_at.asc())
                )
            )
            .scalars()
            .all()
        )


async def test_general_inline_mentions_accept_members_and_honor_preference(
    client,
    app,
    member_project,
    foreign_project,
):
    project_id = member_project["project_id"]
    owner_id = member_project["owner_id"]
    dev_id = member_project["dev_id"]
    document = await create_document(client, project_id)

    general = await client.post(
        f"/api/v1/documents/{document['id']}/comments",
        json={
            "body": "일반 멘션",
            "mentioned_user_ids": [
                str(owner_id),
                str(owner_id),
                str(dev_id),
                str(foreign_project["user_id"]),
            ],
        },
    )
    assert general.status_code == 201, general.text
    assert general.json()["mentions"] == [str(owner_id)]
    notes = await notifications_for(app, owner_id)
    assert len(notes) == 1
    assert notes[0].project_id == project_id
    assert str(notes[0].document_id) == document["id"]
    assert notes[0].work_package_id is None

    async with app.state.sessionmaker() as session, session.begin():
        session.add(UserNotificationSettings(user_id=owner_id, mention=False))

    anchor_id = uuid.uuid4()
    inline = await client.post(
        f"/api/v1/documents/{document['id']}/inline-comments",
        json={
            "body": "인라인 멘션",
            "mentioned_user_ids": [str(owner_id)],
            "anchor_id": str(anchor_id),
            "anchor_quote": "검토",
            "expected_document_version": 0,
            "document_body": (f'<p><span data-comment-anchor="{anchor_id}">검토</span> 문구</p>'),
        },
    )
    assert inline.status_code == 201, inline.text
    assert inline.json()["comment"]["mentions"] == [str(owner_id)]
    assert len(await notifications_for(app, owner_id)) == 1

    listed = (await client.get(f"/api/v1/documents/{document['id']}/comments")).json()
    assert [item["mentions"] for item in listed["items"]] == [
        [str(owner_id)],
        [str(owner_id)],
    ]

    private_document = await create_document(client, project_id, visibility="private")
    private_comment = await client.post(
        f"/api/v1/documents/{private_document['id']}/comments",
        json={"body": "보이지 않는 대상", "mentioned_user_ids": [str(owner_id)]},
    )
    assert private_comment.status_code == 201
    assert private_comment.json()["mentions"] is None

    too_many = [f"00000000-0000-0000-0000-{index:012d}" for index in range(1, 22)]
    assert (
        await client.post(
            f"/api/v1/documents/{document['id']}/comments",
            json={"body": "과다", "mentioned_user_ids": too_many},
        )
    ).status_code == 422


async def test_document_notification_read_visibility_and_delete_cascade(
    client,
    app,
    member_project,
):
    project_id = member_project["project_id"]
    owner_id = member_project["owner_id"]
    dev_id = member_project["dev_id"]
    document = await create_document(client, project_id)

    async with app.state.sessionmaker() as session, session.begin():
        session.add(
            Notification(
                user_id=dev_id,
                actor_id=owner_id,
                project_id=project_id,
                document_id=uuid.UUID(document["id"]),
                kind="document_mention",
            )
        )

    inbox = await client.get("/api/v1/me/notifications")
    assert inbox.status_code == 200
    item = inbox.json()["items"][0]
    assert item["document_id"] == document["id"]
    assert item["document_title"] == "멘션 문서"
    assert item["work_package_id"] is None
    assert inbox.json()["unread"] == 1

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            sa_delete(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == dev_id,
            )
        )
    hidden = await client.get("/api/v1/me/notifications")
    assert hidden.json() == {"items": [], "total": 0, "unread": 0}

    async with app.state.sessionmaker() as session, session.begin():
        session.add(ProjectMember(project_id=project_id, user_id=dev_id, role="member"))
        document_row = await session.get(ProjectDocument, uuid.UUID(document["id"]))
        await session.delete(document_row)

    assert await notifications_for(app, dev_id) == []
