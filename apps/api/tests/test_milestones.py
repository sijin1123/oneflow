"""Milestones + work package assignment (PLAN §3 Phase 2)."""

import pytest

from tests.conftest import create_project, create_wp


@pytest.fixture
async def project(client):
    return await create_project(client, key="MS", name="마일스톤")


async def test_patch_milestone_null_name_rejected(client, project):
    # Explicit null on the NOT NULL name is a 422, never an unhandled 500.
    pid = project["id"]
    m = (await client.post(f"/api/v1/projects/{pid}/milestones", json={"name": "M1"})).json()
    res = await client.patch(f"/api/v1/projects/{pid}/milestones/{m['id']}", json={"name": None})
    assert res.status_code == 422


async def test_milestone_crud(client, project):
    pid = project["id"]
    created = await client.post(
        f"/api/v1/projects/{pid}/milestones",
        json={"name": "  v1.0 릴리스  ", "due_date": "2026-08-01"},
    )
    assert created.status_code == 201
    mid = created.json()["id"]
    assert created.json()["name"] == "v1.0 릴리스"

    listed = (await client.get(f"/api/v1/projects/{pid}/milestones")).json()
    assert listed["total"] == 1

    patched = await client.patch(
        f"/api/v1/projects/{pid}/milestones/{mid}", json={"name": "v1.0 GA"}
    )
    assert patched.status_code == 200 and patched.json()["name"] == "v1.0 GA"

    assert (await client.delete(f"/api/v1/projects/{pid}/milestones/{mid}")).status_code == 204
    assert (await client.get(f"/api/v1/projects/{pid}/milestones")).json()["total"] == 0


async def test_assign_wp_to_milestone(client, project):
    pid = project["id"]
    mid = (await client.post(f"/api/v1/projects/{pid}/milestones", json={"name": "M1"})).json()[
        "id"
    ]
    wp = await create_wp(client, pid, subject="w", milestone_id=mid)
    assert wp["milestone_id"] == mid

    # clearing via patch
    cleared = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "milestone_id": None},
    )
    assert cleared.json()["milestone_id"] is None


async def test_list_work_packages_filters_by_milestone(client, project):
    pid = project["id"]
    m1 = (await client.post(f"/api/v1/projects/{pid}/milestones", json={"name": "M1"})).json()
    m2 = (await client.post(f"/api/v1/projects/{pid}/milestones", json={"name": "M2"})).json()
    await create_wp(client, pid, subject="M1 작업", milestone_id=m1["id"])
    await create_wp(client, pid, subject="M2 작업", milestone_id=m2["id"])
    await create_wp(client, pid, subject="미배정")

    listed = (
        await client.get(f"/api/v1/projects/{pid}/work-packages", params={"milestone_id": m1["id"]})
    ).json()

    assert listed["total"] == 1
    assert listed["items"][0]["subject"] == "M1 작업"


async def test_wp_milestone_must_be_same_project(client, project, foreign_project):
    pid = project["id"]
    # a milestone in another project (create directly)
    other_mid = (
        await client.post(
            f"/api/v1/projects/{foreign_project['project_id']}/milestones",
            json={"name": "other"},
        )
    ).status_code
    # dev is not a member of foreign project -> milestone create there is 404
    assert other_mid == 404
    # assigning a non-existent milestone -> 422
    import uuid

    res = await client.post(
        f"/api/v1/projects/{pid}/work-packages",
        json={"subject": "x", "milestone_id": str(uuid.uuid4())},
    )
    assert res.status_code == 422


async def test_deleting_milestone_nulls_assignment(client, project):
    pid = project["id"]
    mid = (await client.post(f"/api/v1/projects/{pid}/milestones", json={"name": "M"})).json()["id"]
    wp = await create_wp(client, pid, subject="w", milestone_id=mid)
    await client.delete(f"/api/v1/projects/{pid}/milestones/{mid}")
    refreshed = (await client.get(f"/api/v1/work-packages/{wp['id']}")).json()
    assert refreshed["milestone_id"] is None  # FK SET NULL


async def test_nonmember_milestones_hidden(client, foreign_project):
    pid = foreign_project["project_id"]
    assert (await client.get(f"/api/v1/projects/{pid}/milestones")).status_code == 404
    assert (
        await client.post(f"/api/v1/projects/{pid}/milestones", json={"name": "x"})
    ).status_code == 404
