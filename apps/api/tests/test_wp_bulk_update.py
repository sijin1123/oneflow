"""Bulk status/assignee/priority update (expansion PLAN Pass 12 PR-AB).

Contract (v12.1): uniform patch validated ONCE before any write (422 aborts
whole request); rows lock FOR UPDATE in one transaction; unchanged rows are
reported, not re-written; missing and cross-project ids return as ONE opaque
skipped_ids list (existence hiding, R1-③); version bumps and activities record
per actually-changed row; deliberate no-version-token exception."""

import pytest
from sqlalchemy import select

from app.models.activity import Activity
from tests.conftest import create_project, create_wp


async def bulk(client, pid, ids, patch):
    return await client.post(
        f"/api/v1/projects/{pid}/work-packages/bulk-update", json={"ids": ids, "patch": patch}
    )


@pytest.fixture
async def project(client):
    return await create_project(client, key="BULK", name="벌크 프로젝트")


async def test_bulk_updates_and_reports_unchanged(client, app, project):
    pid = project["id"]
    a = await create_wp(client, pid, subject="A", status="backlog")
    b = await create_wp(client, pid, subject="B", status="in_progress")

    res = await bulk(client, pid, [a["id"], b["id"]], {"status": "in_progress"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["updated_ids"] == [a["id"]]
    assert body["unchanged_ids"] == [b["id"]]  # already in_progress — not re-written
    assert body["skipped_ids"] == []

    fresh_a = (await client.get(f"/api/v1/work-packages/{a['id']}")).json()
    fresh_b = (await client.get(f"/api/v1/work-packages/{b['id']}")).json()
    assert (fresh_a["status"], fresh_a["version"]) == ("in_progress", 1)
    assert fresh_b["version"] == 0  # untouched

    # Activity recorded for the changed row only.
    async with app.state.sessionmaker() as session:
        acts = (
            (
                await session.execute(
                    select(Activity).where(
                        Activity.work_package_id == a["id"], Activity.field == "status"
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(acts) == 1


async def test_bulk_combined_fields_and_assignee_notification(client, app, member_project):
    pid = str(member_project["project_id"])
    owner_id = str(member_project["owner_id"])
    a = await create_wp(client, pid, subject="배정 대상")

    res = await bulk(client, pid, [a["id"]], {"assignee_id": owner_id, "priority": "high"})
    assert res.status_code == 200, res.text
    assert res.json()["updated_ids"] == [a["id"]]
    fresh = (await client.get(f"/api/v1/work-packages/{a['id']}")).json()
    assert (fresh["assignee_id"], fresh["priority"], fresh["version"]) == (owner_id, "high", 1)

    from app.models.notification import Notification

    async with app.state.sessionmaker() as session:
        notes = (
            (
                await session.execute(
                    select(Notification).where(
                        Notification.user_id == member_project["owner_id"],
                        Notification.kind == "assigned",
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(notes) == 1


async def test_bulk_skipped_is_opaque(client, project, foreign_project):
    pid = project["id"]
    mine = await create_wp(client, pid, subject="내 것")
    foreign_wp = str(foreign_project["wp_id"])  # cross-project
    ghost = "00000000-0000-0000-0000-000000000000"  # missing

    res = await bulk(client, pid, [mine["id"], foreign_wp, ghost], {"priority": "low"})
    body = res.json()
    assert body["updated_ids"] == [mine["id"]]
    # One opaque list — cross-project and missing are indistinguishable.
    assert sorted(body["skipped_ids"]) == sorted([foreign_wp, ghost])

    # The foreign row was NOT touched (verified via its owner-side state? —
    # existence hiding blocks us; the skipped list is the contract).


async def test_bulk_validation_and_guards(client, project, foreign_project):
    pid = project["id"]
    wp = await create_wp(client, pid, subject="가드")

    # Uniform patch validation fails BEFORE any write → whole request 422.
    assert (await bulk(client, pid, [wp["id"]], {"status": "nope"})).status_code == 422
    assert (await bulk(client, pid, [wp["id"]], {})).status_code == 422
    stranger = str(foreign_project["user_id"])
    assert (await bulk(client, pid, [wp["id"]], {"assignee_id": stranger})).status_code == 422
    fresh = (await client.get(f"/api/v1/work-packages/{wp['id']}")).json()
    assert fresh["version"] == 0  # nothing written

    # Limit: 101 unique ids → 422.
    many = [f"00000000-0000-0000-0000-{i:012d}" for i in range(1, 102)]
    assert (await bulk(client, pid, many, {"priority": "low"})).status_code == 422

    # Non-member project 404, archived 409.
    foreign_pid = str(foreign_project["project_id"])
    assert (await bulk(client, foreign_pid, [wp["id"]], {"priority": "low"})).status_code == 404
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (await bulk(client, pid, [wp["id"]], {"priority": "low"})).status_code == 409
    await client.post(f"/api/v1/projects/{pid}/unarchive")
