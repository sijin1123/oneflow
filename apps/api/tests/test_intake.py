"""Project intake queue (expansion PLAN Pass 2 PR-H).

Contract: member submit / owner triage; members see only their own items;
decisions move OPEN (pending/snoozed) items exactly once — a concurrent accept
succeeds once and never duplicates the created work package; body is
sanitized at the write boundary."""

import asyncio

import pytest
from sqlalchemy import func, select

from app.models import IntakeItem, WorkPackage
from tests.conftest import create_project


async def submit(client, project_id, title="문의 사항", **extra) -> dict:
    res = await client.post(f"/api/v1/projects/{project_id}/intake", json={"title": title, **extra})
    assert res.status_code == 201, res.text
    return res.json()


async def triage(client, project_id, item_id, status, **extra):
    return await client.post(
        f"/api/v1/projects/{project_id}/intake/{item_id}/triage",
        json={"status": status, **extra},
    )


@pytest.fixture
async def project(client):
    return await create_project(client, key="INT", name="인테이크 프로젝트")


async def test_submit_and_owner_sees_queue(client, project):
    item = await submit(client, project["id"], title="로그인이 느려요")
    assert item["status"] == "pending"
    assert item["submitter_name"]

    listed = (await client.get(f"/api/v1/projects/{project['id']}/intake")).json()
    assert listed["total"] == 1
    assert listed["items"][0]["title"] == "로그인이 느려요"


async def test_member_sees_only_own_items(client, app, member_project):
    pid = str(member_project["project_id"])
    # The OWNER's item (direct row) must stay invisible to the dev member.
    async with app.state.sessionmaker() as session, session.begin():
        session.add(
            IntakeItem(
                project_id=member_project["project_id"],
                title="소유자 제출",
                submitted_by=member_project["owner_id"],
            )
        )
    mine = await submit(client, pid, title="멤버 제출")

    listed = (await client.get(f"/api/v1/projects/{pid}/intake")).json()
    titles = {i["title"] for i in listed["items"]}
    assert titles == {"멤버 제출"}
    assert mine["id"] in {i["id"] for i in listed["items"]}

    # A plain member cannot triage (403 via require_role).
    res = await triage(client, pid, mine["id"], "declined")
    assert res.status_code == 403


async def test_accept_creates_linked_wp_and_transitions_are_single_shot(client, app, project):
    pid = project["id"]
    item = await submit(client, pid, title="검색 개선", body="<p>검색이 <b>느립니다</b></p>")

    res = await triage(client, pid, item["id"], "accepted")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "accepted"
    assert body["accepted_wp_id"]

    wp = (await client.get(f"/api/v1/work-packages/{body['accepted_wp_id']}")).json()
    assert wp["subject"] == "검색 개선"
    assert "느립니다" in wp["description"]

    # Final states are immutable: re-triaging → 409.
    res = await triage(client, pid, item["id"], "declined")
    assert res.status_code == 409

    # Snoozed stays open: it can still be accepted later.
    snoozed = await submit(client, pid, title="나중에 볼 것")
    res = await triage(client, pid, snoozed["id"], "snoozed", snooze_until="2026-08-01")
    assert res.status_code == 200
    assert res.json()["snooze_until"] == "2026-08-01"
    res = await triage(client, pid, snoozed["id"], "accepted")
    assert res.status_code == 200

    # Invalid decision value → 422.
    third = await submit(client, pid, title="검증")
    res = await triage(client, pid, third["id"], "pending")
    assert res.status_code == 422


async def test_concurrent_accept_succeeds_exactly_once(client, project):
    """Two simultaneous accepts on one item: exactly one 200, one 409, and
    exactly ONE work package exists (the loser's insert rolled back)."""
    pid = project["id"]
    item = await submit(client, pid, title="동시 수락 경쟁")

    r1, r2 = await asyncio.gather(
        triage(client, pid, item["id"], "accepted"),
        triage(client, pid, item["id"], "accepted"),
    )
    assert sorted([r1.status_code, r2.status_code]) == [200, 409]


async def test_concurrent_accept_leaves_single_wp(app, client, project):
    pid = project["id"]
    item = await submit(client, pid, title="단일 WP 보장")
    r1, r2 = await asyncio.gather(
        triage(client, pid, item["id"], "accepted"),
        triage(client, pid, item["id"], "accepted"),
    )
    assert sorted([r1.status_code, r2.status_code]) == [200, 409]
    async with app.state.sessionmaker() as session:
        count = (
            await session.execute(
                select(func.count())
                .select_from(WorkPackage)
                .where(WorkPackage.subject == "단일 WP 보장")
            )
        ).scalar_one()
    assert count == 1


async def test_non_member_hidden(client, foreign_project):
    foreign = str(foreign_project["project_id"])
    assert (await client.get(f"/api/v1/projects/{foreign}/intake")).status_code == 404
    res = await client.post(f"/api/v1/projects/{foreign}/intake", json={"title": "외부"})
    assert res.status_code == 404
