"""Milestone progress rollup (expansion PLAN Pass 30 PR-AV).

Contract (v30.1): counts come from ONE COUNT-FILTER aggregate scoped to the
project (cross-project bleed impossible); done = the fixed closed vocabulary;
default 0 on non-list responses; milestone delete SET-NULLs assignments."""

from tests.conftest import create_project, create_wp


async def make_milestone(client, pid, name="M1"):
    res = await client.post(
        f"/api/v1/projects/{pid}/milestones", json={"name": name, "due_date": "2026-08-01"}
    )
    return res.json()


async def test_progress_counts_and_scope(client):
    project = await create_project(client, key="MSP", name="밀스톤 진행")
    pid = project["id"]
    m = await make_milestone(client, pid)
    other = await make_milestone(client, pid, name="다른 밀스톤")

    await create_wp(client, pid, subject="열림", milestone_id=m["id"])
    done = await create_wp(client, pid, subject="완료", milestone_id=m["id"])
    await client.patch(
        f"/api/v1/work-packages/{done['id']}", json={"expected_version": 0, "status": "done"}
    )
    await create_wp(client, pid, subject="다른 소속", milestone_id=other["id"])
    await create_wp(client, pid, subject="미배정")

    # Same-name milestone in ANOTHER project must never bleed in (scope test).
    p2 = await create_project(client, key="MSP2", name="교차 프로젝트")
    m2 = await make_milestone(client, p2["id"])
    await create_wp(client, p2["id"], subject="교차", milestone_id=m2["id"])

    items = (await client.get(f"/api/v1/projects/{pid}/milestones")).json()["items"]
    by_name = {i["name"]: i for i in items}
    assert (by_name["M1"]["work_package_count"], by_name["M1"]["done_work_package_count"]) == (2, 1)
    assert by_name["다른 밀스톤"]["work_package_count"] == 1

    # Non-list responses carry the default 0 (create path — no aggregate).
    fresh = await make_milestone(client, pid, name="새 밀스톤")
    assert (fresh["work_package_count"], fresh["done_work_package_count"]) == (0, 0)


async def test_delete_promotes_assignments(client):
    project = await create_project(client, key="MSP3", name="삭제 승격")
    pid = project["id"]
    m = await make_milestone(client, pid)
    wp = await create_wp(client, pid, subject="배정됨", milestone_id=m["id"])

    res = await client.delete(f"/api/v1/projects/{pid}/milestones/{m['id']}")
    assert res.status_code == 204
    fresh = (await client.get(f"/api/v1/work-packages/{wp['id']}")).json()
    assert fresh["milestone_id"] is None  # SET NULL — the WP survives
