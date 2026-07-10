"""Cycle burndown-lite (expansion PLAN Pass 21 PR-AM).

Contract (v21.1): current-assignment scope; per-WP status timelines rebuilt
exactly from activity history (old_value before the first change, new_value
after each, unchanged otherwise); closed = the FIXED key vocabulary; UTC
date-only boundaries; the series stops at today; member read with archived
projects readable and foreign cycles hidden."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from tests.conftest import create_project, create_wp


def _day(offset: int) -> str:
    return (datetime.now(UTC).date() + timedelta(days=offset)).isoformat()


async def make_cycle(client, pid, start_offset=-3, end_offset=3):
    res = await client.post(
        f"/api/v1/projects/{pid}/cycles",
        json={
            "name": "번다운 사이클",
            "start_date": _day(start_offset),
            "end_date": _day(end_offset),
        },
    )
    return res.json()


async def burndown(client, pid, cid):
    return await client.get(f"/api/v1/projects/{pid}/cycles/{cid}/burndown")


@pytest.fixture
async def project(client):
    return await create_project(client, key="BURN", name="번다운 프로젝트")


async def test_reconstruction_from_history(client, app, project):
    pid = project["id"]
    cycle = await make_cycle(client, pid)
    # WP created "3 days ago" (backdated), done "yesterday".
    wp = await create_wp(client, pid, subject="이력 대상", cycle_id=cycle["id"])
    await client.patch(
        f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 0, "status": "done"}
    )
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text(
                "UPDATE work_packages SET created_at = now() - interval '3 days' "
                "WHERE id = CAST(:id AS uuid)"
            ).bindparams(id=wp["id"])
        )
        await session.execute(
            text(
                "UPDATE activities SET created_at = now() - interval '1 day' "
                "WHERE work_package_id = CAST(:id AS uuid) AND field = 'status'"
            ).bindparams(id=wp["id"])
        )
    # A second WP with NO status history — its current status holds throughout.
    await create_wp(client, pid, subject="불변 대상", cycle_id=cycle["id"])

    body = (await burndown(client, pid, cycle["id"])).json()
    assert body["scope"] == "current_assignment"
    assert body["total_scope"] == 2
    by_date = {d["date"]: d["remaining"] for d in body["days"]}
    # 3 days ago: wp1 existed (backlog — old_value before its change), wp2 not yet → 1
    assert by_date[_day(-3)] == 1
    # yesterday: wp1 turned done; wp2 exists (created today? no — created now) →
    # wp2 created today, so yesterday remaining = 0
    assert by_date[_day(-1)] == 0
    # today: wp1 done, wp2 open → 1
    assert by_date[_day(0)] == 1
    # the series never reaches into the future
    assert _day(1) not in by_date


async def test_reopen_counts_again(client, app, project):
    pid = project["id"]
    cycle = await make_cycle(client, pid)
    wp = await create_wp(client, pid, subject="재오픈", cycle_id=cycle["id"])
    await client.patch(
        f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 0, "status": "done"}
    )
    await client.patch(
        f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 1, "status": "in_progress"}
    )
    body = (await burndown(client, pid, cycle["id"])).json()
    assert body["days"][-1]["remaining"] == 1  # reopened today → still burning


async def test_scope_and_guards(client, project, foreign_project):
    pid = project["id"]
    cycle = await make_cycle(client, pid)
    await create_wp(client, pid, subject="사이클 밖")  # unassigned — excluded

    body = (await burndown(client, pid, cycle["id"])).json()
    assert body["total_scope"] == 0
    assert body["days"] == []

    # Future-only cycle: no fabricated days.
    future = await make_cycle(client, pid, start_offset=2, end_offset=5)
    assert (await burndown(client, pid, future["id"])).json()["days"] == []

    # Archived project stays readable (read-open).
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (await burndown(client, pid, cycle["id"])).status_code == 200
    await client.post(f"/api/v1/projects/{pid}/unarchive")

    # Existence hiding: foreign project and cross-project cycle id.
    foreign_pid = str(foreign_project["project_id"])
    assert (await burndown(client, foreign_pid, cycle["id"])).status_code == 404
