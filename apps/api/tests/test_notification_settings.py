"""Per-user notification preferences (expansion PLAN Pass 2 PR-E2).

Contract: absent row = all True; preferences gate notification CREATION only
(no retro-hiding); `assigned` gates the assignment kind, `watched` gates
watch_status/watch_assigned, `commented` gates watch_comment."""

import pytest
from sqlalchemy import select

from app.models import Notification, UserNotificationSettings, WpWatcher
from tests.conftest import create_project, create_wp


async def _notes_for(app, user_id, kind) -> list:
    async with app.state.sessionmaker() as session:
        return list(
            (
                await session.execute(
                    select(Notification).where(
                        Notification.user_id == user_id, Notification.kind == kind
                    )
                )
            )
            .scalars()
            .all()
        )


@pytest.fixture
async def project(client):
    return await create_project(client, key="PRF", name="설정 프로젝트")


async def test_defaults_and_roundtrip(client):
    res = await client.get("/api/v1/me/notification-settings")
    assert res.status_code == 200
    assert res.json() == {
        "assigned": True,
        "watched": True,
        "commented": True,
        "mention": True,
        "due_alerts": True,
        "intake": True,
        "initiatives": True,
    }

    res = await client.put("/api/v1/me/notification-settings", json={"watched": False})
    assert res.status_code == 200
    assert res.json() == {
        "assigned": True,
        "watched": False,
        "commented": True,
        "mention": True,
        "due_alerts": True,
        "intake": True,
        "initiatives": True,
    }

    # Partial update keeps the other toggles.
    res = await client.put("/api/v1/me/notification-settings", json={"commented": False})
    assert res.json() == {
        "assigned": True,
        "watched": False,
        "commented": False,
        "mention": True,
        "due_alerts": True,
        "intake": True,
        "initiatives": True,
    }


async def test_assigned_off_suppresses_new_assignment_notifications(client, app, member_project):
    owner_id = member_project["owner_id"]
    pid = str(member_project["project_id"])
    # Turn the OWNER's assigned preference off (direct row — dev-auth acts as dev).
    async with app.state.sessionmaker() as session, session.begin():
        session.add(UserNotificationSettings(user_id=owner_id, assigned=False))

    wp = await create_wp(client, pid, subject="선호 배정 억제")
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "assignee_id": str(owner_id)},
    )
    assert res.status_code == 200, res.text
    assert await _notes_for(app, owner_id, "assigned") == []


async def test_watched_and_commented_preferences_gate_fan_out(client, app, member_project):
    owner_id = member_project["owner_id"]
    pid = str(member_project["project_id"])
    wp = await create_wp(client, pid, subject="선호 워치 억제")
    async with app.state.sessionmaker() as session, session.begin():
        session.add(WpWatcher(work_package_id=wp["id"], user_id=owner_id))
        # watched off, commented ON.
        session.add(UserNotificationSettings(user_id=owner_id, watched=False, commented=True))

    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "status": "in_progress"},
    )
    assert res.status_code == 200
    assert await _notes_for(app, owner_id, "watch_status") == []

    # commented stays on → the comment still notifies.
    res = await client.post(f"/api/v1/work-packages/{wp['id']}/comments", json={"body": "댓글"})
    assert res.status_code == 201
    assert len(await _notes_for(app, owner_id, "watch_comment")) == 1


async def test_preferences_never_retro_hide_existing_notifications(client, app, member_project):
    """Turning a kind off stops NEW rows only — the inbox keeps history."""
    pid = str(member_project["project_id"])
    owner_id = member_project["owner_id"]
    dev_id = member_project["dev_id"]
    wp = await create_wp(client, pid, subject="소급 금지")
    async with app.state.sessionmaker() as session, session.begin():
        session.add(
            Notification(
                user_id=dev_id,
                actor_id=owner_id,
                project_id=member_project["project_id"],
                work_package_id=wp["id"],
                kind="watch_status",
            )
        )
    await client.put("/api/v1/me/notification-settings", json={"watched": False})
    res = await client.get("/api/v1/me/notifications")
    assert any(n["kind"] == "watch_status" for n in res.json()["items"])
