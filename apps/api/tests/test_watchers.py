"""Work-package watchers + notification fan-out (expansion PLAN Pass 2 PR-E1).

Contract under test: self-service watch/unwatch (idempotent), existence hiding
for non-members, same-transaction fan-out on status/comment/assignee changes,
actor self-exclusion, assignee dedupe (richer 'assigned' wins), and query-time
membership evaluation (revoked members receive nothing)."""

import pytest
from sqlalchemy import delete, select

from app.models import Notification, ProjectMember, User, WpWatcher
from tests.conftest import create_project, create_wp


async def _watch(client, wp_id) -> None:
    res = await client.put(f"/api/v1/work-packages/{wp_id}/watchers/me")
    assert res.status_code == 204, res.text


async def _notifications_for(app, user_id, kind=None) -> list:
    async with app.state.sessionmaker() as session:
        stmt = select(Notification).where(Notification.user_id == user_id)
        if kind:
            stmt = stmt.where(Notification.kind == kind)
        return list((await session.execute(stmt)).scalars().all())


@pytest.fixture
async def project(client):
    return await create_project(client, key="WAT", name="워처 프로젝트")


async def test_watch_unwatch_idempotent_and_listed(client, project):
    wp = await create_wp(client, project["id"], subject="관찰 대상")
    await _watch(client, wp["id"])
    await _watch(client, wp["id"])  # second watch is a no-op, not a 409

    res = await client.get(f"/api/v1/work-packages/{wp['id']}/watchers")
    body = res.json()
    assert body["total"] == 1
    assert body["me_watching"] is True

    res = await client.delete(f"/api/v1/work-packages/{wp['id']}/watchers/me")
    assert res.status_code == 204
    res = await client.delete(f"/api/v1/work-packages/{wp['id']}/watchers/me")  # idempotent
    assert res.status_code == 204
    assert (await client.get(f"/api/v1/work-packages/{wp['id']}/watchers")).json()["total"] == 0


async def test_non_member_cannot_watch_or_list(client, foreign_project):
    wp_id = foreign_project["wp_id"]
    assert (await client.put(f"/api/v1/work-packages/{wp_id}/watchers/me")).status_code == 404
    assert (await client.get(f"/api/v1/work-packages/{wp_id}/watchers")).status_code == 404


async def test_status_and_comment_fan_out_excludes_actor(client, app, member_project):
    """The dev user watches a WP in a shared project; the OWNER acts via direct DB
    writes are impractical here, so instead: dev watches, dev acts — dev must NOT
    be notified (actor exclusion); the owner watches via row insert and IS notified."""
    pid = member_project["project_id"]
    owner_id = member_project["owner_id"]
    wp = await create_wp(client, str(pid), subject="공유 관찰")

    # Owner watches (direct row — API acts as dev user only in dev auth mode).
    async with app.state.sessionmaker() as session, session.begin():
        session.add(WpWatcher(work_package_id=wp["id"], user_id=owner_id))
    # Dev watches too, then ACTS — dev is the actor so only the owner is notified.
    await _watch(client, wp["id"])

    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "status": "in_progress"},
    )
    assert res.status_code == 200, res.text

    owner_notes = await _notifications_for(app, owner_id, kind="watch_status")
    assert len(owner_notes) == 1
    dev_id = (await client.get("/api/v1/me")).json()["id"]
    assert await _notifications_for(app, dev_id, kind="watch_status") == []

    # Comment triggers watch_comment for the owner, again not for the actor.
    res = await client.post(
        f"/api/v1/work-packages/{wp['id']}/comments", json={"body": "진행 시작합니다"}
    )
    assert res.status_code == 201
    assert len(await _notifications_for(app, owner_id, kind="watch_comment")) == 1
    assert await _notifications_for(app, dev_id, kind="watch_comment") == []


async def test_assignee_dedupe_gets_assigned_not_watch_assigned(client, app, member_project):
    """A watcher who becomes the assignee gets ONE 'assigned' notification, not
    an additional watch_assigned duplicate."""
    pid = member_project["project_id"]
    owner_id = member_project["owner_id"]
    wp = await create_wp(client, str(pid), subject="배정 중복 방지")
    async with app.state.sessionmaker() as session, session.begin():
        session.add(WpWatcher(work_package_id=wp["id"], user_id=owner_id))

    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "assignee_id": str(owner_id)},
    )
    assert res.status_code == 200, res.text

    assert len(await _notifications_for(app, owner_id, kind="assigned")) == 1
    assert await _notifications_for(app, owner_id, kind="watch_assigned") == []


async def test_revoked_member_receives_nothing(client, app, member_project):
    """Watcher rows survive revocation, but fan-out joins membership at send
    time — a revoked member gets no notification and resumes after re-join."""
    pid = member_project["project_id"]
    owner_id = member_project["owner_id"]
    dev_id = member_project["dev_id"]
    wp = await create_wp(client, str(pid), subject="해지 검증")
    async with app.state.sessionmaker() as session, session.begin():
        session.add(WpWatcher(work_package_id=wp["id"], user_id=owner_id))
        # Revoke the OWNER's membership directly (dev stays to act).
        await session.execute(
            delete(ProjectMember).where(
                ProjectMember.project_id == pid, ProjectMember.user_id == owner_id
            )
        )

    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "status": "todo"},
    )
    assert res.status_code == 200, res.text
    assert await _notifications_for(app, owner_id, kind="watch_status") == []
    assert dev_id  # dev acted; nothing else to assert for the actor


async def test_watch_notifications_render_in_inbox(client, app, member_project):
    """The /me/notifications feed accepts the new kinds (dev as recipient)."""
    pid = member_project["project_id"]
    owner_id = member_project["owner_id"]
    dev_id = member_project["dev_id"]
    wp = await create_wp(client, str(pid), subject="인박스 렌더")
    # Dev watches; the OWNER acts via a direct notification-producing change:
    # simulate the owner changing status by inserting the notification through
    # the same fan-out path is impractical without acting as another user, so
    # instead verify the inbox endpoint renders a watch_* row inserted directly.
    async with app.state.sessionmaker() as session, session.begin():
        session.add(
            Notification(
                user_id=dev_id,
                actor_id=owner_id,
                project_id=pid,
                work_package_id=wp["id"],
                kind="watch_status",
            )
        )
    res = await client.get("/api/v1/me/notifications")
    assert res.status_code == 200
    kinds = {n["kind"] for n in res.json()["items"]}
    assert "watch_status" in kinds
