"""Automation AND secondary condition (Pass 81 PR-CT, v81.1).

A rule may carry an optional secondary condition (condition_field +
condition_value) evaluated as equality on the WP's pre_automation state
(post-user-change, pre-automation-write). Winner policy is specificity-first:
a condition-matched rule beats an unconditional rule on the same target field.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.automation_rule import AutomationRule
from tests.conftest import create_project, create_wp


@pytest.fixture
async def project(client):
    return await create_project(client, key="ANDC", name="AND 조건")


async def _rule(client, pid, **over):
    payload = {
        "name": over.pop("name", "규칙"),
        "trigger_type": over.pop("trigger_type", "status_changed_to"),
        "trigger_value": over.pop("trigger_value", "in_review"),
        "action_type": over.pop("action_type", "set_priority"),
        "action_value": over.pop("action_value", "urgent"),
        **over,
    }
    return await client.post(f"/api/v1/projects/{pid}/automation-rules", json=payload)


async def _runs(client, pid):
    return (await client.get(f"/api/v1/projects/{pid}/automation-rules/runs")).json()


async def _fired(client, pid, rid):
    listed = (await client.get(f"/api/v1/projects/{pid}/automation-rules")).json()
    return next(r["fired_count"] for r in listed["items"] if r["id"] == rid)


async def test_condition_gates_firing(client, project):
    """Trigger matches but condition must also hold on the pre_automation state."""
    pid = project["id"]
    r = (
        await _rule(
            client, pid, action_value="urgent", condition_field="type", condition_value="bug"
        )
    ).json()
    bug = await create_wp(client, pid, subject="버그", type="bug", priority="low")
    task = await create_wp(client, pid, subject="일반", type="task", priority="low")

    # bug WP → condition holds → fires.
    hit = await client.patch(
        f"/api/v1/work-packages/{bug['id']}",
        json={"expected_version": bug["version"], "status": "in_review"},
    )
    assert hit.json()["priority"] == "urgent"

    # task WP → condition fails → no fire, no run, no counter bump.
    miss = await client.patch(
        f"/api/v1/work-packages/{task['id']}",
        json={"expected_version": task["version"], "status": "in_review"},
    )
    assert miss.json()["priority"] == "low"
    assert (await _runs(client, pid))["total"] == 1  # only the bug row
    assert await _fired(client, pid, r["id"]) == 1


async def test_condition_evaluated_on_pre_automation_state(client, project):
    """Trigger and condition fields both change in one PATCH — the condition is
    read from the post-user-change (pre_automation) values."""
    pid = project["id"]
    # Dev user is a member, so set_assignee survives the fire-time recheck.
    me = (await client.get("/api/v1/me")).json()
    assert (
        await _rule(
            client,
            pid,
            action_type="set_assignee",
            action_value=me["id"],
            condition_field="priority",
            condition_value="high",
        )
    ).status_code == 201
    wp = await create_wp(client, pid, subject="동시 변경", priority="low")
    # One PATCH sets status (trigger) AND priority=high (condition) → fires.
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": wp["version"], "status": "in_review", "priority": "high"},
    )
    assert res.json()["assignee_id"] == me["id"]


async def test_condition_field_equals_action_target(client, project):
    """condition_field may equal the action target — evaluated on pre_automation
    state, so 'priority is high → set priority low' is valid and fires."""
    pid = project["id"]
    await _rule(
        client,
        pid,
        action_type="set_priority",
        action_value="low",
        condition_field="priority",
        condition_value="high",
    )
    wp = await create_wp(client, pid, subject="강등", priority="high")
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": wp["version"], "status": "in_review"},
    )
    # pre_automation priority is high (unchanged) → fires → written to low.
    assert res.json()["priority"] == "low"


async def test_conditional_beats_unconditional(client, project):
    """Specificity-first: a matched conditional rule wins the field over an
    unconditional rule regardless of created_at; when the condition fails the
    unconditional rule applies."""
    pid = project["id"]
    # Unconditional first (older), conditional second (newer).
    await _rule(client, pid, name="무조건", action_value="medium")
    await _rule(
        client,
        pid,
        name="조건부",
        action_value="urgent",
        condition_field="type",
        condition_value="bug",
    )
    bug = await create_wp(client, pid, subject="버그", type="bug", priority="low")
    task = await create_wp(client, pid, subject="일반", type="task", priority="low")

    hit = await client.patch(
        f"/api/v1/work-packages/{bug['id']}",
        json={"expected_version": bug["version"], "status": "in_review"},
    )
    assert hit.json()["priority"] == "urgent"  # conditional wins
    miss = await client.patch(
        f"/api/v1/work-packages/{task['id']}",
        json={"expected_version": task["version"], "status": "in_review"},
    )
    assert miss.json()["priority"] == "medium"  # falls back to unconditional


async def test_validation_matrix(client, project):
    pid = project["id"]
    # only one side set → 422
    assert (await _rule(client, pid, condition_field="type")).status_code == 422
    assert (await _rule(client, pid, condition_value="bug")).status_code == 422
    # bad field → 422
    assert (
        await _rule(client, pid, condition_field="assignee", condition_value="x")
    ).status_code == 422
    # bad value for field → 422
    assert (
        await _rule(client, pid, condition_field="type", condition_value="nope")
    ).status_code == 422
    # valid pair → 201
    assert (
        await _rule(client, pid, condition_field="status", condition_value="done")
    ).status_code == 201


async def test_update_sets_and_clears_condition(client, project):
    pid = project["id"]
    rid = (await _rule(client, pid)).json()["id"]
    # set a condition
    set_res = await client.patch(
        f"/api/v1/projects/{pid}/automation-rules/{rid}",
        json={"condition_field": "type", "condition_value": "bug"},
    )
    assert set_res.status_code == 200
    assert set_res.json()["condition_field"] == "type"
    # providing only the field (no value) → 422 both-or-neither
    bad = await client.patch(
        f"/api/v1/projects/{pid}/automation-rules/{rid}",
        json={"condition_field": "status"},
    )
    assert bad.status_code == 422
    # clear the whole pair
    cleared = await client.patch(
        f"/api/v1/projects/{pid}/automation-rules/{rid}",
        json={"condition_field": None, "condition_value": None},
    )
    assert cleared.status_code == 200
    assert cleared.json()["condition_field"] is None
    assert cleared.json()["condition_value"] is None


async def test_db_check_rejects_bad_condition(app, project):
    """Defense-in-depth: the DB CHECK closes the value vocabulary even if a row
    is written outside the app validators (v81.1 R1-④)."""
    pid = uuid.UUID(project["id"])
    async with app.state.sessionmaker() as session:
        session.add(
            AutomationRule(
                project_id=pid,
                name="직접삽입",
                trigger_type="status_changed_to",
                trigger_value="in_review",
                action_type="set_priority",
                action_value="urgent",
                condition_field="status",
                condition_value="not_a_status",
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()


async def test_bulk_per_row_condition(client, project):
    """Bulk: rows sharing a fired map but differing pre_automation state resolve
    the condition independently (v81.1 R1-③)."""
    pid = project["id"]
    await _rule(
        client,
        pid,
        trigger_value="done",
        action_value="urgent",
        condition_field="type",
        condition_value="bug",
    )
    bug = await create_wp(client, pid, subject="버그", type="bug", priority="low")
    task = await create_wp(client, pid, subject="일반", type="task", priority="low")
    noop = await create_wp(client, pid, subject="이미 완료", type="bug", status="done")

    res = await client.post(
        f"/api/v1/projects/{pid}/work-packages/bulk-update",
        json={"ids": [bug["id"], task["id"], noop["id"]], "patch": {"status": "done"}},
    )
    assert res.status_code == 200, res.text
    runs = await _runs(client, pid)
    # Only the bug row (condition holds AND status actually changed) fires.
    assert runs["total"] == 1
    assert runs["items"][0]["work_package_subject"] == "버그"
