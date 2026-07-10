"""Automation execution log (expansion PLAN Pass 16 PR-AG).

Contract (v16.1): fired = run = ACTUALLY APPLIED — a candidate that loses to a
user-set field, equals the current value, or rides a failed conditional UPDATE
leaves no run and no fired increment; the log survives rule deletion via
snapshots; runs are member-readable and existence-hidden for non-members."""

import pytest
from sqlalchemy import text

from tests.conftest import create_project, create_wp


async def create_rule(client, pid, **over):
    body = {
        "name": "완료되면 긴급",
        "trigger_type": "status_changed_to",
        "trigger_value": "done",
        "action_type": "set_priority",
        "action_value": "urgent",
    }
    body.update(over)
    return await client.post(f"/api/v1/projects/{pid}/automation-rules", json=body)


async def runs(client, pid):
    return (await client.get(f"/api/v1/projects/{pid}/automation-rules/runs")).json()


@pytest.fixture
async def project(client):
    return await create_project(client, key="ARUN", name="실행 로그 프로젝트")


async def test_applied_change_logs_run_and_fires(client, project):
    pid = project["id"]
    rule = (await create_rule(client, pid)).json()
    wp = await create_wp(client, pid, subject="로그 대상")

    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 0, "status": "done"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["priority"] == "urgent"

    body = await runs(client, pid)
    assert body["total"] == 1
    run = body["items"][0]
    assert run["rule_id"] == rule["id"]
    assert run["rule_name"] == "완료되면 긴급"
    assert run["work_package_subject"] == "로그 대상"
    assert (run["field"], run["old_value"], run["new_value"]) == ("priority", "none", "urgent")

    listed = (await client.get(f"/api/v1/projects/{pid}/automation-rules")).json()
    assert listed["items"][0]["fired_count"] == 1


async def test_no_run_when_overridden_noop_or_conflicted(client, project):
    pid = project["id"]
    await create_rule(client, pid)
    wp = await create_wp(client, pid, subject="무발화 대상")

    # User sets priority explicitly in the same request → automation loses.
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "status": "done", "priority": "low"},
    )
    assert res.json()["priority"] == "low"
    assert (await runs(client, pid))["total"] == 0

    # No-op: value already equals the candidate → no run, no fired.
    wp2 = await create_wp(client, pid, subject="이미 긴급", priority="urgent")
    await client.patch(
        f"/api/v1/work-packages/{wp2['id']}", json={"expected_version": 0, "status": "done"}
    )
    assert (await runs(client, pid))["total"] == 0

    # Conditional-update miss (stale version) → 409, nothing recorded.
    wp3 = await create_wp(client, pid, subject="충돌 대상")
    res = await client.patch(
        f"/api/v1/work-packages/{wp3['id']}", json={"expected_version": 99, "status": "done"}
    )
    assert res.status_code == 409
    assert (await runs(client, pid))["total"] == 0

    rules_listed = (await client.get(f"/api/v1/projects/{pid}/automation-rules")).json()
    assert rules_listed["items"][0]["fired_count"] == 0


async def test_bulk_apply_logs_per_row(client, project):
    pid = project["id"]
    await create_rule(client, pid)
    a = await create_wp(client, pid, subject="벌크 A")
    b = await create_wp(client, pid, subject="벌크 B", priority="urgent")  # no-op row

    res = await client.post(
        f"/api/v1/projects/{pid}/work-packages/bulk-update",
        json={"ids": [a["id"], b["id"]], "patch": {"status": "done"}},
    )
    assert res.status_code == 200, res.text
    body = await runs(client, pid)
    # Only the row whose priority actually changed logs a run.
    assert body["total"] == 1
    assert body["items"][0]["work_package_subject"] == "벌크 A"
    rules_listed = (await client.get(f"/api/v1/projects/{pid}/automation-rules")).json()
    assert rules_listed["items"][0]["fired_count"] == 1


async def test_log_survives_rule_delete_and_hides_from_nonmembers(
    client, app, project, foreign_project
):
    pid = project["id"]
    rule = (await create_rule(client, pid)).json()
    wp = await create_wp(client, pid, subject="보존 확인")
    await client.patch(
        f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 0, "status": "done"}
    )

    res = await client.delete(f"/api/v1/projects/{pid}/automation-rules/{rule['id']}")
    assert res.status_code == 204
    body = await runs(client, pid)
    assert body["total"] == 1
    assert body["items"][0]["rule_id"] is None  # reference gone…
    assert body["items"][0]["rule_name"] == "완료되면 긴급"  # …snapshot readable

    # WP delete also preserves the row via SET NULL + subject snapshot.
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text("DELETE FROM work_packages WHERE id = CAST(:id AS uuid)").bindparams(id=wp["id"])
        )
    body = await runs(client, pid)
    assert body["items"][0]["work_package_id"] is None
    assert body["items"][0]["work_package_subject"] == "보존 확인"

    # Non-member: the runs endpoint is existence-hidden.
    foreign_pid = str(foreign_project["project_id"])
    res = await client.get(f"/api/v1/projects/{foreign_pid}/automation-rules/runs")
    assert res.status_code == 404
