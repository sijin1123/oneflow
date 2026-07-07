"""Automation rule full edit + fire audit (expansion PLAN Pass 13 PR-AC).

Contract (v13.1): partial edits validate the MERGED rule (an edit can never
leave the trigger/action pair invalid); fired = the rule's change was ACTUALLY
applied (v16.1 redefinition — counted with the run log in the applying
transaction); a field
the user set explicitly in the same request is never overwritten (setdefault
precedence)."""

import pytest

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


async def patch_rule(client, pid, rule_id, patch):
    return await client.patch(f"/api/v1/projects/{pid}/automation-rules/{rule_id}", json=patch)


@pytest.fixture
async def project(client):
    return await create_project(client, key="AUTO", name="자동화 프로젝트")


async def test_full_edit_roundtrip_and_merged_validation(client, project):
    pid = project["id"]
    rule = (await create_rule(client, pid)).json()

    res = await patch_rule(
        client,
        pid,
        rule["id"],
        {"name": "검토로 가면 높음", "trigger_value": "in_review", "action_value": "high"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["name"], body["trigger_value"], body["action_value"]) == (
        "검토로 가면 높음",
        "in_review",
        "high",
    )
    assert body["is_active"] is True  # untouched fields keep their value

    # Merged validation: an invalid value for the EXISTING action type is 422.
    assert (
        await patch_rule(client, pid, rule["id"], {"action_value": "banana"})
    ).status_code == 422
    assert (await patch_rule(client, pid, rule["id"], {"trigger_value": "nope"})).status_code == 422
    # Nothing was corrupted by the rejected edits.
    listed = (await client.get(f"/api/v1/projects/{pid}/automation-rules")).json()
    assert listed["items"][0]["action_value"] == "high"


async def test_fire_audit_counts_only_when_rule_wins(client, project):
    pid = project["id"]
    rule = (await create_rule(client, pid, trigger_value="done", action_value="urgent")).json()
    wp = await create_wp(client, pid, subject="발화 대상")

    # Non-matching status change → no fire.
    await client.patch(
        f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 0, "status": "in_progress"}
    )
    listed = (await client.get(f"/api/v1/projects/{pid}/automation-rules")).json()
    assert listed["items"][0]["fired_count"] == 0
    assert listed["items"][0]["last_fired_at"] is None

    # Matching change → fired once, priority applied.
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 1, "status": "done"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["priority"] == "urgent"
    listed = (await client.get(f"/api/v1/projects/{pid}/automation-rules")).json()
    assert listed["items"][0]["fired_count"] == 1
    assert listed["items"][0]["last_fired_at"] is not None

    # Two rules on the same field: only the LAST (winner) fires.
    late = (await create_rule(client, pid, name="나중 규칙", action_value="low")).json()
    wp2 = await create_wp(client, pid, subject="승자 확인")
    res = await client.patch(
        f"/api/v1/work-packages/{wp2['id']}", json={"expected_version": 0, "status": "done"}
    )
    assert res.json()["priority"] == "low"  # created_at asc — last wins
    listed = (await client.get(f"/api/v1/projects/{pid}/automation-rules")).json()
    by_id = {r["id"]: r for r in listed["items"]}
    assert by_id[late["id"]]["fired_count"] == 1
    assert by_id[rule["id"]]["fired_count"] == 1  # unchanged — it lost this round


async def test_user_explicit_field_beats_automation(client, project):
    pid = project["id"]
    await create_rule(client, pid, trigger_value="done", action_value="urgent")
    wp = await create_wp(client, pid, subject="우선순위 명시")

    # The user sets priority IN THE SAME request — automation must not override.
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "status": "done", "priority": "low"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["priority"] == "low"


async def test_edit_guards(client, project, foreign_project):
    pid = project["id"]
    rule = (await create_rule(client, pid)).json()

    # Non-member project path is existence-hidden (owner-only 403 for plain
    # members is covered by the existing automation permission tests).
    foreign_pid = str(foreign_project["project_id"])
    assert (
        await patch_rule(client, foreign_pid, rule["id"], {"name": "남의 것"})
    ).status_code == 404

    # Archived project: edits are writes → 409.
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (await patch_rule(client, pid, rule["id"], {"name": "보관 중"})).status_code == 409
    await client.post(f"/api/v1/projects/{pid}/unarchive")
