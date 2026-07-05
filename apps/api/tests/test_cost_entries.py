"""Cost tracking: cost entries + project budget (PLAN §3 Phase 3)."""

import pytest

from tests.conftest import create_project, create_wp


@pytest.fixture
async def project(client):
    return await create_project(client, key="COST", name="비용")


async def test_log_and_list_cost(client, project):
    wp = await create_wp(client, project["id"], subject="비용 대상")
    await client.post(
        f"/api/v1/work-packages/{wp['id']}/cost-entries",
        json={"amount": 150000, "kind": "labor", "spent_on": "2026-07-01"},
    )
    await client.post(
        f"/api/v1/work-packages/{wp['id']}/cost-entries",
        json={"amount": 50000.5, "kind": "material", "spent_on": "2026-07-02"},
    )
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/cost-entries")).json()
    assert listed["total"] == 2
    assert listed["total_amount"] == 200000.5


async def test_cost_validation(client, project):
    wp = await create_wp(client, project["id"])
    for bad in [{"amount": 0}, {"amount": -5}, {"amount": 10, "kind": "bribe"}]:
        res = await client.post(
            f"/api/v1/work-packages/{wp['id']}/cost-entries",
            json={"spent_on": "2026-07-01", **bad},
        )
        assert res.status_code == 422


async def test_delete_own_cost_entry(client, project):
    wp = await create_wp(client, project["id"])
    created = (
        await client.post(
            f"/api/v1/work-packages/{wp['id']}/cost-entries",
            json={"amount": 100, "spent_on": "2026-07-01"},
        )
    ).json()
    assert (
        await client.delete(f"/api/v1/work-packages/{wp['id']}/cost-entries/{created['id']}")
    ).status_code == 204


async def test_project_budget_update_owner_only(client, project, foreign_project):
    # owner sets budget
    res = await client.patch(f"/api/v1/projects/{project['id']}", json={"budget": 5000000})
    assert res.status_code == 200 and res.json()["budget"] == 5000000.0
    # non-member gets 404 (existence hiding)
    forbidden = await client.patch(
        f"/api/v1/projects/{foreign_project['project_id']}", json={"budget": 1}
    )
    assert forbidden.status_code == 404


async def test_dashboard_cost_and_budget(client, project):
    pid = project["id"]
    await client.patch(f"/api/v1/projects/{pid}", json={"budget": 1000000})
    wp = await create_wp(client, pid, subject="c")
    await client.post(
        f"/api/v1/work-packages/{wp['id']}/cost-entries",
        json={"amount": 250000, "spent_on": "2026-07-01"},
    )
    d = (await client.get(f"/api/v1/projects/{pid}/dashboard")).json()
    assert d["budget"] == 1000000.0
    assert d["total_cost"] == 250000.0


async def test_nonmember_cost_hidden(client, foreign_project):
    wp_id = foreign_project["wp_id"]
    assert (await client.get(f"/api/v1/work-packages/{wp_id}/cost-entries")).status_code == 404
    assert (
        await client.post(
            f"/api/v1/work-packages/{wp_id}/cost-entries",
            json={"amount": 1, "spent_on": "2026-07-01"},
        )
    ).status_code == 404
