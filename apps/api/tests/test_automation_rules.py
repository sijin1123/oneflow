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
    # Two active rules on the same status: the TOPMOST (lowest position — the
    # first-created after backfill) wins, every time (Pass 82: owner-set
    # priority; ties broken by position asc, then created_at asc).
    pid = project["id"]
    await _make_rule(client, pid, trigger="in_review", action="low")  # position 0 → wins
    await _make_rule(client, pid, trigger="in_review", action="urgent")
    for _ in range(3):
        wp = await create_wp(client, pid, subject="다중 규칙", priority="none")
        patched = await client.patch(
            f"/api/v1/work-packages/{wp['id']}",
            json={"expected_version": wp["version"], "status": "in_review"},
        )
        assert patched.json()["priority"] == "low"


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


async def _rule(client, pid, name, trigger_type, trigger_value, action="high"):
    res = await client.post(
        f"/api/v1/projects/{pid}/automation-rules",
        json={
            "name": name,
            "trigger_type": trigger_type,
            "trigger_value": trigger_value,
            "action_type": "set_priority",
            "action_value": action,
            "is_active": True,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


async def test_type_and_priority_triggers(client, project):
    """Pass 41 PR-BG (v41.1): new triggers fire on REAL user changes only and
    merge with status rules in one created_at asc, id asc order."""
    pid = project["id"]
    await _rule(client, pid, "버그면 긴급", "type_changed_to", "bug", action="urgent")

    wp = await create_wp(client, pid, subject="타입 트리거")
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 0, "type": "bug"}
    )
    assert res.status_code == 200
    assert res.json()["priority"] == "urgent"

    # No-op type echo (same value) never fires (R1-②).
    wp2 = await create_wp(client, pid, subject="노옵")
    base_type = wp2["type"]
    res = await client.patch(
        f"/api/v1/work-packages/{wp2['id']}", json={"expected_version": 0, "type": base_type}
    )
    assert res.json()["priority"] == wp2["priority"]

    # priority trigger + set_priority action cannot chain (single-pass):
    # a status rule setting priority does NOT fire the priority trigger.
    await _rule(client, pid, "검수 시 높음", "status_changed_to", "in_review", action="high")
    await _rule(
        client, pid, "높음이면 긴급(체인 금지)", "priority_changed_to", "high", action="urgent"
    )
    wp3 = await create_wp(client, pid, subject="체인 금지")
    res = await client.patch(
        f"/api/v1/work-packages/{wp3['id']}", json={"expected_version": 0, "status": "in_review"}
    )
    # The status rule applied 'high'; the priority rule did NOT chain to urgent.
    assert res.json()["priority"] == "high"

    # A USER priority change does fire the priority trigger.
    wp4 = await create_wp(client, pid, subject="사용자 우선순위 발화")
    res = await client.patch(
        f"/api/v1/work-packages/{wp4['id']}", json={"expected_version": 0, "priority": "high"}
    )
    assert res.json()["priority"] == "high"  # user value wins over the rule's urgent

    # Vocabulary guards (422): value must match the trigger's vocabulary.
    bad = await client.post(
        f"/api/v1/projects/{pid}/automation-rules",
        json={
            "name": "이상한 값",
            "trigger_type": "type_changed_to",
            "trigger_value": "todo",
            "action_type": "set_priority",
            "action_value": "high",
        },
    )
    assert bad.status_code == 422


async def test_multi_trigger_merge_order_and_bulk(client, project):
    """Two triggers firing in ONE request merge in ONE global order — the
    TOPMOST rule per field wins (Pass 82: position asc, first-match); bulk fires
    per-row real changes only."""
    pid = project["id"]
    # Topmost rule (status, position 0) then a later rule (type, position 1):
    # the topmost wins the shared field, even across different triggers (R1-②).
    await _rule(client, pid, "검수 높음", "status_changed_to", "in_review", action="high")
    await _rule(client, pid, "버그 긴급", "type_changed_to", "bug", action="urgent")

    wp = await create_wp(client, pid, subject="동시 발화")
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "status": "in_review", "type": "bug"},
    )
    assert res.json()["priority"] == "high"  # topmost rule per field wins

    # Bulk: priority change fires per row; a row already at the target
    # priority is a no-op row (no fire).
    await _rule(client, pid, "긴급이면 검수높음X", "priority_changed_to", "urgent", action="low")
    a = await create_wp(client, pid, subject="벌크 발화 대상")
    b = await create_wp(client, pid, subject="벌크 노옵 대상")
    await client.patch(
        f"/api/v1/work-packages/{b['id']}", json={"expected_version": 0, "priority": "urgent"}
    )
    # b is now urgent + rule already applied 'low'? No: that PATCH fired the rule,
    # but set_priority targets the SAME field the user set → user wins (setdefault).
    res = await client.post(
        f"/api/v1/projects/{pid}/work-packages/bulk-update",
        json={"ids": [a["id"], b["id"]], "patch": {"priority": "urgent"}},
    )
    assert res.status_code == 200, res.text
    listed = (await client.get(f"/api/v1/projects/{pid}/work-packages")).json()
    by_subject = {w["subject"]: w for w in listed["items"]}
    # Both rows end at the user's value (rule's set_priority never overrides
    # the user's own priority patch); the no-op row b stayed unchanged.
    assert by_subject["벌크 발화 대상"]["priority"] == "urgent"
    assert by_subject["벌크 노옵 대상"]["priority"] == "urgent"
