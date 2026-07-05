"""Notifications on assignment + inbox endpoints (PLAN §3 Phase 2 알림)."""

import uuid

import pytest
from sqlalchemy import func, select

from app.models import Notification, ProjectMember, User
from tests.conftest import create_project, create_wp


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
