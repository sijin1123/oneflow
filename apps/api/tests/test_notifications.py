"""Notifications on assignment + inbox endpoints (PLAN §3 Phase 2 알림)."""

import base64
import uuid
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models import Notification, ProjectMember, User
from app.services.storage_sweep import _fetch_keys_from_connection
from tests.conftest import create_project, create_wp

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPkndLBwMDAxAAGAA2bAS37E8jFAAAAAElFTkSuQmCC"
)


def image_headers(revision: int, filename: str) -> dict[str, str]:
    return {
        "content-type": "image/png",
        "If-Match": f'"{revision}"',
        "X-File-Name": filename,
    }


@pytest.fixture
async def project(client):
    return await create_project(client, key="NTF", name="알림")


@pytest.fixture
async def member2(app, project) -> str:
    """A second project member (someone the dev user can assign work to)."""
    async with app.state.sessionmaker() as session, session.begin():
        u = User(email="bob@oneflow.local", display_name="Bob")
        session.add(u)
        await session.flush()
        session.add(ProjectMember(project_id=uuid.UUID(project["id"]), user_id=u.id, role="member"))
        return str(u.id)


async def test_assignment_creates_notification_for_assignee(client, app, project, member2):
    wp = await create_wp(client, project["id"], subject="배정 작업", assignee_id=member2)
    async with app.state.sessionmaker() as session:
        rows = (
            (
                await session.execute(
                    select(Notification).where(Notification.user_id == uuid.UUID(member2))
                )
            )
            .scalars()
            .all()
        )
    assert len(rows) == 1
    assert rows[0].kind == "assigned"
    assert rows[0].work_package_id == uuid.UUID(wp["id"])
    assert rows[0].actor_name == "Dev User"
    assert rows[0].actor_profile_image_storage_key is None


async def test_assignment_keeps_event_identity_after_profile_and_account_changes(
    client, app, project, member2
):
    uploaded = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers=image_headers(1, "notification-actor.png"),
    )
    assert uploaded.status_code == 200, uploaded.text
    actor_id = uuid.UUID(uploaded.json()["id"])
    await create_wp(client, project["id"], subject="스냅샷 배정", assignee_id=member2)

    async with app.state.sessionmaker() as session, session.begin():
        notification = (
            await session.execute(
                select(Notification).where(Notification.user_id == uuid.UUID(member2))
            )
        ).scalar_one()
        assert notification.actor_id == actor_id
        assert notification.actor_name == "Dev User"
        assert notification.actor_profile_image_storage_key is not None
        old_key = notification.actor_profile_image_storage_key
        actor = await session.get(User, actor_id)
        assert actor is not None
        actor.display_name = "Renamed User"

    old_path = Path(app.state.settings.storage_dir) / old_key
    replaced = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers=image_headers(2, "replacement.png"),
    )
    assert replaced.status_code == 200, replaced.text
    assert old_path.is_file()

    removed = await client.delete(
        "/api/v1/me/profile-image",
        headers={"If-Match": '"3"'},
    )
    assert removed.status_code == 200
    async with app.state.sessionmaker() as session, session.begin():
        notification = (
            await session.execute(
                select(Notification).where(Notification.user_id == uuid.UUID(member2))
            )
        ).scalar_one()
        assert notification.actor_name == "Dev User"
        assert notification.actor_profile_image_storage_key == old_key
        assert old_key in await _fetch_keys_from_connection(session)
        actor = await session.get(User, actor_id)
        assert actor is not None
        await session.delete(actor)
        await session.flush()
        await session.refresh(notification)
        assert notification.actor_id is None
        assert notification.actor_name == "Dev User"
        assert notification.actor_profile_image_storage_key == old_key
    assert old_path.is_file()


async def test_notification_actor_image_is_immutable_versioned_and_recipient_only(
    client, app, project
):
    me = (await client.get("/api/v1/me")).json()
    version = uuid.uuid4()
    actor_key = f"{uuid.uuid4()}/{version}"
    actor_path = Path(app.state.settings.storage_dir) / actor_key
    actor_path.parent.mkdir(parents=True, exist_ok=True)
    actor_path.write_bytes(PNG)

    async with app.state.sessionmaker() as session, session.begin():
        actor = User(email="actor@oneflow.local", display_name="Snapshot Actor")
        other = User(email="recipient@oneflow.local", display_name="Other Recipient")
        session.add_all([actor, other])
        await session.flush()
        own_notification = Notification(
            user_id=uuid.UUID(me["id"]),
            project_id=uuid.UUID(project["id"]),
            actor_id=actor.id,
            actor_name_snapshot=actor.display_name,
            actor_profile_image_storage_key=actor_key,
            actor_profile_image_content_type="image/png",
            kind="assigned",
        )
        foreign_notification = Notification(
            user_id=other.id,
            project_id=uuid.UUID(project["id"]),
            actor_id=actor.id,
            actor_name_snapshot=actor.display_name,
            actor_profile_image_storage_key=actor_key,
            actor_profile_image_content_type="image/png",
            kind="assigned",
        )
        session.add_all([own_notification, foreign_notification])
        await session.flush()
        own_id = own_notification.id
        foreign_id = foreign_notification.id
        actor_id = actor.id

    listed = (await client.get("/api/v1/me/notifications")).json()
    assert listed["total"] == 1
    item = listed["items"][0]
    assert item["actor_name"] == "Snapshot Actor"
    image_url = item["actor_profile_image_url"]
    assert image_url == f"/api/v1/me/notifications/{own_id}/actor-image?version={version}"
    image = await client.get(image_url)
    assert image.status_code == 200
    assert image.content == PNG
    assert image.headers["cache-control"] == "private, no-store"

    wrong_version = image_url.rsplit("=", 1)[0] + f"={uuid.uuid4()}"
    assert (await client.get(wrong_version)).status_code == 404
    assert (
        await client.get(f"/api/v1/me/notifications/{foreign_id}/actor-image?version={version}")
    ).status_code == 404

    async with app.state.sessionmaker() as session, session.begin():
        actor = await session.get(User, actor_id)
        assert actor is not None
        await session.delete(actor)
        await session.flush()
    listed_after_delete = (await client.get("/api/v1/me/notifications")).json()
    historical = listed_after_delete["items"][0]
    assert historical["actor_name"] == "Snapshot Actor"
    assert historical["actor_profile_image_url"] == image_url
    assert (await client.get(image_url)).content == PNG
    async with app.state.sessionmaker() as session:
        assert actor_key in await _fetch_keys_from_connection(session)


async def test_self_assignment_creates_no_notification(client, app, project):
    me = (await client.get("/api/v1/me")).json()
    await create_wp(client, project["id"], subject="셀프 배정", assignee_id=me["id"])
    async with app.state.sessionmaker() as session:
        count = (await session.execute(select(func.count()).select_from(Notification))).scalar_one()
    assert count == 0


async def test_patch_reassignment_notifies(client, app, project, member2):
    wp = await create_wp(client, project["id"], subject="재배정")
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "assignee_id": member2},
    )
    assert res.status_code == 200
    async with app.state.sessionmaker() as session:
        rows = (
            (
                await session.execute(
                    select(Notification).where(Notification.user_id == uuid.UUID(member2))
                )
            )
            .scalars()
            .all()
        )
    assert len(rows) == 1


async def test_list_mark_read_and_read_all(client, app, project):
    me = (await client.get("/api/v1/me")).json()
    dev_id = uuid.UUID(me["id"])
    wp = await create_wp(client, project["id"], subject="알림 대상")
    async with app.state.sessionmaker() as session, session.begin():
        session.add_all(
            [
                Notification(
                    user_id=dev_id,
                    project_id=uuid.UUID(project["id"]),
                    work_package_id=uuid.UUID(wp["id"]),
                    kind="assigned",
                )
                for _ in range(2)
            ]
        )

    listed = (await client.get("/api/v1/me/notifications")).json()
    assert listed["total"] == 2
    assert listed["unread"] == 2
    assert listed["items"][0]["work_package_subject"] == "알림 대상"

    nid = listed["items"][0]["id"]
    assert (await client.post(f"/api/v1/me/notifications/{nid}/read")).status_code == 204
    assert (await client.get("/api/v1/me/notifications")).json()["unread"] == 1

    only = (await client.get("/api/v1/me/notifications?unread_only=true")).json()
    assert only["total"] == 1 and only["unread"] == 1

    assert (await client.post("/api/v1/me/notifications/read-all")).status_code == 204
    assert (await client.get("/api/v1/me/notifications")).json()["unread"] == 0


async def test_mark_other_users_notification_is_404(client, app, project):
    async with app.state.sessionmaker() as session, session.begin():
        other = User(email="carol@oneflow.local", display_name="Carol")
        session.add(other)
        await session.flush()
        n = Notification(user_id=other.id, project_id=uuid.UUID(project["id"]), kind="assigned")
        session.add(n)
        await session.flush()
        nid = str(n.id)
    # dev user cannot mark someone else's notification → 404, and it stays unread
    assert (await client.post(f"/api/v1/me/notifications/{nid}/read")).status_code == 404
