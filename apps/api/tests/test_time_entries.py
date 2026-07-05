"""Time tracking: estimated_hours field + time entries (PLAN §3 Phase 3)."""

import pytest

from tests.conftest import create_project, create_wp


@pytest.fixture
async def project(client):
    return await create_project(client, key="TT", name="시간 추적")


async def test_estimated_hours_on_create_and_patch(client, project):
    wp = await create_wp(client, project["id"], subject="추정", estimated_hours=8)
    assert wp["estimated_hours"] == 8.0
    patched = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "estimated_hours": 12.5},
    )
    assert patched.status_code == 200
    assert patched.json()["estimated_hours"] == 12.5
    # change is on the activity timeline
    acts = (await client.get(f"/api/v1/work-packages/{wp['id']}/activities")).json()
    assert any(a["field"] == "estimated_hours" for a in acts["items"])


async def test_estimated_hours_range(client, project):
    res = await client.post(
        f"/api/v1/projects/{project['id']}/work-packages",
        json={"subject": "x", "estimated_hours": 5000},
    )
    assert res.status_code == 422


async def test_log_and_list_time_entries(client, project):
    wp = await create_wp(client, project["id"], subject="시간 대상")
    for hours, day in [(2.5, "2026-07-01"), (3, "2026-07-02")]:
        res = await client.post(
            f"/api/v1/work-packages/{wp['id']}/time-entries",
            json={"hours": hours, "spent_on": day, "comment": "작업"},
        )
        assert res.status_code == 201

    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/time-entries")).json()
    assert listed["total"] == 2
    assert listed["total_hours"] == 5.5  # sum
    assert listed["items"][0]["spent_on"] == "2026-07-01"  # ordered by date


async def test_log_time_validation(client, project):
    wp = await create_wp(client, project["id"])
    for bad in [0, -1, 1001]:
        res = await client.post(
            f"/api/v1/work-packages/{wp['id']}/time-entries",
            json={"hours": bad, "spent_on": "2026-07-01"},
        )
        assert res.status_code == 422


async def test_delete_own_time_entry(client, project):
    wp = await create_wp(client, project["id"])
    created = (
        await client.post(
            f"/api/v1/work-packages/{wp['id']}/time-entries",
            json={"hours": 1, "spent_on": "2026-07-01"},
        )
    ).json()
    # dev user is the author -> can delete
    res = await client.delete(f"/api/v1/work-packages/{wp['id']}/time-entries/{created['id']}")
    assert res.status_code == 204
    assert (await client.get(f"/api/v1/work-packages/{wp['id']}/time-entries")).json()["total"] == 0


async def test_nonmember_time_entries_hidden(client, foreign_project):
    wp_id = foreign_project["wp_id"]
    assert (await client.get(f"/api/v1/work-packages/{wp_id}/time-entries")).status_code == 404
    assert (
        await client.post(
            f"/api/v1/work-packages/{wp_id}/time-entries",
            json={"hours": 1, "spent_on": "2026-07-01"},
        )
    ).status_code == 404
