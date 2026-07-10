"""Due-date alert generator (expansion PLAN Pass 40 PR-BF).

Contract (v40.1): UTC boundaries; due_soon = due tomorrow, overdue = due
YESTERDAY only (no backfill — first-run flood impossible); recipient =
assignee while a current ACTIVE member with due_alerts on (absent row =
true); single INSERT..SELECT with same-day NOT EXISTS dedupe; concurrent
runs no-op via try-lock; actor is null (system event)."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from tests.conftest import create_project, create_wp


def day(offset: int) -> str:
    return (datetime.now(UTC).date() + timedelta(days=offset)).isoformat()


@pytest.fixture
async def project(client):
    return await create_project(client, key="DUE", name="기한 프로젝트")


async def assign_me(client, pid, subject, due_offset, status=None):
    me = (await client.get("/api/v1/me")).json()
    wp = await create_wp(client, pid, subject=subject)
    body = {"expected_version": 0, "assignee_id": me["id"], "due_date": day(due_offset)}
    if status:
        body["status"] = status
    res = await client.patch(f"/api/v1/work-packages/{wp['id']}", json=body)
    assert res.status_code == 200, res.text
    return wp


async def run_alerts(app, create=True):
    """Run against the app's test engine settings."""
    import app.services.due_alerts as mod

    settings = app.state.settings
    orig = mod.get_settings
    mod.get_settings = lambda: settings
    try:
        return await mod.run(create=create)
    finally:
        mod.get_settings = orig


async def test_selection_dedupe_and_shape(client, app, project):
    pid = project["id"]
    await assign_me(client, pid, "내일 마감", 1)
    await assign_me(client, pid, "어제 초과", -1)
    await assign_me(client, pid, "오래된 초과 (백필 없음)", -10)
    await assign_me(client, pid, "오늘 마감 (알림 아님)", 0)
    await assign_me(client, pid, "종결 초과", -1, status="done")
    unassigned = await create_wp(client, pid, subject="미배정")
    await client.patch(
        f"/api/v1/work-packages/{unassigned['id']}",
        json={"expected_version": 0, "due_date": day(-1)},
    )

    # Dry-run reports without inserting.
    dry = await run_alerts(app, create=False)
    assert dry == {"due_soon": 1, "overdue": 1}
    inbox = (await client.get("/api/v1/me/notifications")).json()
    assert inbox["total"] == 0

    created = await run_alerts(app)
    assert created == {"due_soon": 1, "overdue": 1}
    # Same-day rerun is idempotent (NOT EXISTS dedupe).
    assert await run_alerts(app) == {"due_soon": 0, "overdue": 0}

    inbox = (await client.get("/api/v1/me/notifications")).json()
    kinds = sorted(n["kind"] for n in inbox["items"])
    assert kinds == ["due_soon", "overdue"]
    assert all(n["actor_name"] is None for n in inbox["items"])  # system event
    assert inbox["unread"] == 2


async def test_gates_membership_activity_and_toggle(client, app, project):
    pid = project["id"]
    await assign_me(client, pid, "토글 오프 대상", 1)

    # due_alerts=false gates creation (explicit row).
    assert (
        await client.put("/api/v1/me/notification-settings", json={"due_alerts": False})
    ).status_code == 200
    assert await run_alerts(app) == {"due_soon": 0, "overdue": 0}
    # Toggle back on (existing row, true) → created.
    await client.put("/api/v1/me/notification-settings", json={"due_alerts": True})
    assert await run_alerts(app) == {"due_soon": 1, "overdue": 0}

    # Deactivated assignee is skipped (Pass 33 semantics).
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(text("DELETE FROM notifications"))
        await session.execute(
            text("UPDATE users SET is_active = false WHERE email = 'dev@oneflow.local'")
        )
    assert await run_alerts(app) == {"due_soon": 0, "overdue": 0}
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text("UPDATE users SET is_active = true WHERE email = 'dev@oneflow.local'")
        )

    # Removed membership is skipped even though the assignee value remains.
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(text("DELETE FROM project_members"))
    assert await run_alerts(app) == {"due_soon": 0, "overdue": 0}


async def test_archived_projects_are_skipped(client, app, project):
    pid = project["id"]
    await assign_me(client, pid, "보관 대상", 1)
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert await run_alerts(app) == {"due_soon": 0, "overdue": 0}
