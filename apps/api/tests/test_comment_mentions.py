"""Comment mentions with notifications (expansion PLAN Pass 10 PR-X).

Contract (v10.1): mentions are structured data (no body @-parsing); the server
keeps MEMBERS only (non-members silently dropped — an ex-member mention never
blocks the comment), ignores self, persists the accepted set on the comment,
and fans out 'mention' notifications AFTER watchers so nobody is notified twice
for one comment (R1-① ordering: exclude = watch RETURNING set)."""

import pytest
from sqlalchemy import select

from app.models.notification import Notification
from app.models.notification_setting import UserNotificationSettings
from app.models.watcher import WpWatcher
from tests.conftest import create_wp


async def comment(client, wp_id, body="댓글", mentions=None):
    payload = {"body": body}
    if mentions is not None:
        payload["mentioned_user_ids"] = mentions
    return await client.post(f"/api/v1/work-packages/{wp_id}/comments", json=payload)


async def _notifications_for(app, user_id, kind=None) -> list:
    async with app.state.sessionmaker() as session:
        stmt = select(Notification).where(Notification.user_id == user_id)
        if kind:
            stmt = stmt.where(Notification.kind == kind)
        return list((await session.execute(stmt)).scalars().all())


@pytest.fixture
async def wp(client, member_project):
    return await create_wp(client, str(member_project["project_id"]), subject="멘션 작업")


async def test_mention_notifies_member_and_persists_accepted(client, app, member_project, wp):
    owner_id = str(member_project["owner_id"])
    res = await comment(client, wp["id"], "@owner 확인 부탁", mentions=[owner_id])
    assert res.status_code == 201, res.text
    assert res.json()["mentions"] == [owner_id]

    notes = await _notifications_for(app, member_project["owner_id"], kind="mention")
    assert len(notes) == 1

    # Listing echoes the accepted set (canonical representation — R1-②).
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/comments")).json()
    assert listed["items"][0]["mentions"] == [owner_id]


async def test_self_and_nonmember_mentions_dropped(
    client, app, member_project, foreign_project, wp
):
    dev_id = str(member_project["dev_id"])
    stranger_id = str(foreign_project["user_id"])  # not a member of this project

    res = await comment(client, wp["id"], "혼잣말", mentions=[dev_id, stranger_id])
    assert res.status_code == 201
    assert res.json()["mentions"] is None  # nothing accepted → null, comment still created
    assert await _notifications_for(app, member_project["dev_id"], kind="mention") == []
    assert await _notifications_for(app, foreign_project["user_id"], kind="mention") == []


async def test_watcher_mention_dedupe_matrix(client, app, member_project, wp):
    """R1-① combinations: watcher+mention → ONE watch_comment (no duplicate);
    watcher with 'commented' off + mention on → the mention still arrives."""
    owner_id = member_project["owner_id"]
    async with app.state.sessionmaker() as session, session.begin():
        session.add(WpWatcher(work_package_id=wp["id"], user_id=owner_id))

    # Both toggles on: watch_comment wins, mention suppressed.
    assert (
        await comment(client, wp["id"], "중복 확인", mentions=[str(owner_id)])
    ).status_code == 201
    assert len(await _notifications_for(app, owner_id, kind="watch_comment")) == 1
    assert await _notifications_for(app, owner_id, kind="mention") == []

    # commented OFF, mention ON: the watch path skips → the mention arrives.
    async with app.state.sessionmaker() as session, session.begin():
        session.add(UserNotificationSettings(user_id=owner_id, commented=False))
    assert (await comment(client, wp["id"], "멘션만", mentions=[str(owner_id)])).status_code == 201
    assert len(await _notifications_for(app, owner_id, kind="watch_comment")) == 1  # unchanged
    assert len(await _notifications_for(app, owner_id, kind="mention")) == 1


async def test_mention_toggle_off_suppresses_but_accepts(client, app, member_project, wp):
    owner_id = member_project["owner_id"]
    async with app.state.sessionmaker() as session, session.begin():
        session.add(UserNotificationSettings(user_id=owner_id, mention=False))

    res = await comment(client, wp["id"], "무음 멘션", mentions=[str(owner_id)])
    assert res.status_code == 201
    # Accepted (renders as a mention) but no notification (preference off).
    assert res.json()["mentions"] == [str(owner_id)]
    assert await _notifications_for(app, owner_id, kind="mention") == []


async def test_mention_limit_and_settings_roundtrip(client, member_project, wp):
    # 21 distinct ids exceed the cap → 422 (dedup happens first).
    too_many = [f"00000000-0000-0000-0000-{i:012d}" for i in range(1, 22)]
    assert (await comment(client, wp["id"], "과다", mentions=too_many)).status_code == 422

    # Settings API round-trips the new toggle (absent row = default true).
    assert (await client.get("/api/v1/me/notification-settings")).json()["mention"] is True
    res = await client.put("/api/v1/me/notification-settings", json={"mention": False})
    assert res.json()["mention"] is False
    assert (await client.get("/api/v1/me/notification-settings")).json()["mention"] is False
