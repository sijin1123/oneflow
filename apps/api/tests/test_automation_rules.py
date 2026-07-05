"""Project automation rules + engine (PLAN §3 Phase 3 자동화)."""

import pytest

from tests.conftest import create_project, create_wp


@pytest.fixture
async def project(client):
    return await create_project(client, key="AUTO", name="자동화")


async def _make_rule(client, pid, trigger="in_review", action="high", active=True):
    return await client.post(
        f"/api/v1/projects/{pid}/automation-rules",
        json={
            "name": "검수 시 우선순위 상향",
            "trigger_type": "status_changed_to",
            "trigger_value": trigger,
            "action_type": "set_priority",
            "action_value": action,
            "is_active": active,
        },
    )


async def test_rule_crud(client, project):
    pid = project["id"]
    created = await _make_rule(client, pid)
    assert created.status_code == 201
    rid = created.json()["id"]

    listed = (await client.get(f"/api/v1/projects/{pid}/automation-rules")).json()
    assert listed["total"] == 1

    toggled = await client.patch(
        f"/api/v1/projects/{pid}/automation-rules/{rid}", json={"is_active": False}
    )
    assert toggled.status_code == 200 and toggled.json()["is_active"] is False

    assert (
        await client.delete(f"/api/v1/projects/{pid}/automation-rules/{rid}")
    ).status_code == 204
    assert (await client.get(f"/api/v1/projects/{pid}/automation-rules")).json()["total"] == 0


async def test_active_rule_applies_on_status_change(client, project):
    pid = project["id"]
    await _make_rule(client, pid, trigger="in_review", action="urgent")
    wp = await create_wp(client, pid, subject="자동화 대상", priority="low")

    patched = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": wp["version"], "status": "in_review"},
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["status"] == "in_review"
    assert body["priority"] == "urgent"  # rule applied in the same request


async def test_user_priority_wins_over_rule(client, project):
    pid = project["id"]
    await _make_rule(client, pid, trigger="in_review", action="urgent")
    wp = await create_wp(client, pid, subject="명시 우선순위", priority="low")

    # user sets both status and priority → the explicit priority is not overridden
    patched = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": wp["version"], "status": "in_review", "priority": "medium"},
    )
    assert patched.json()["priority"] == "medium"


async def test_inactive_rule_does_not_apply(client, project):
    pid = project["id"]
    await _make_rule(client, pid, trigger="in_review", action="urgent", active=False)
    wp = await create_wp(client, pid, subject="비활성", priority="low")

    patched = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": wp["version"], "status": "in_review"},
    )
    assert patched.json()["priority"] == "low"  # unchanged


async def test_rule_only_fires_on_actual_change(client, project):
    pid = project["id"]
    await _make_rule(client, pid, trigger="todo", action="urgent")
    wp = await create_wp(client, pid, subject="동일 상태", status="todo", priority="low")

    # PATCH status to the SAME value → no real change → rule does not fire
    patched = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": wp["version"], "status": "todo"},
    )
    assert patched.json()["priority"] == "low"


async def test_multiple_rules_resolve_deterministically(client, project):
    # Two active rules on the same status: the most recently created one wins,
    # every time (fable5 audit: nondeterministic multi-rule precedence).
    pid = project["id"]
    await _make_rule(client, pid, trigger="in_review", action="low")
    await _make_rule(client, pid, trigger="in_review", action="urgent")  # newer → wins
    for _ in range(3):
        wp = await create_wp(client, pid, subject="다중 규칙", priority="none")
        patched = await client.patch(
            f"/api/v1/work-packages/{wp['id']}",
            json={"expected_version": wp["version"], "status": "in_review"},
        )
        assert patched.json()["priority"] == "urgent"


async def test_create_requires_owner_and_valid_values(client, project, foreign_project):
    pid = project["id"]
    # invalid action value → 422
    bad = await client.post(
        f"/api/v1/projects/{pid}/automation-rules",
        json={
            "name": "bad",
            "trigger_type": "status_changed_to",
            "trigger_value": "in_review",
            "action_type": "set_priority",
            "action_value": "not_a_priority",
        },
    )
    assert bad.status_code == 422

    # non-member project → 404
    assert (
        await client.get(f"/api/v1/projects/{foreign_project['project_id']}/automation-rules")
    ).status_code == 404
