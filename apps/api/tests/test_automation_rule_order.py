"""Automation rule explicit priority / reorder (Pass 82 PR-CU, v82.1).

position gives owners an explicit priority: the topmost (lowest position) rule
wins its target field within a specificity tier. Specificity-first (conditional
> unconditional, Pass 81) still dominates. /order rewrites 0..n-1 atomically.
"""

import pytest

from tests.conftest import create_project, create_wp


@pytest.fixture
async def project(client):
    return await create_project(client, key="ORD", name="우선순위")


async def _rule(client, pid, **over):
    payload = {
        "name": over.pop("name", "규칙"),
        "trigger_type": over.pop("trigger_type", "status_changed_to"),
        "trigger_value": over.pop("trigger_value", "done"),
        "action_type": over.pop("action_type", "set_priority"),
        "action_value": over.pop("action_value", "urgent"),
        **over,
    }
    res = await client.post(f"/api/v1/projects/{pid}/automation-rules", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


async def _order(client, pid, ordered_ids):
    return await client.put(
        f"/api/v1/projects/{pid}/automation-rules/order", json={"ordered_ids": ordered_ids}
    )


async def _apply(client, pid, subject="대상"):
    wp = await create_wp(client, pid, subject=subject, priority="none")
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": wp["version"], "status": "done"},
    )
    return res.json()["priority"]


async def test_create_appends_position(client, project):
    pid = project["id"]
    a = await _rule(client, pid, action_value="urgent")
    b = await _rule(client, pid, action_value="high")
    c = await _rule(client, pid, action_value="low")
    assert [a["position"], b["position"], c["position"]] == [0, 1, 2]  # MAX+1, no dupes


async def test_reorder_changes_winner(client, project):
    pid = project["id"]
    a = await _rule(client, pid, name="A", action_value="urgent")  # position 0 → wins
    b = await _rule(client, pid, name="B", action_value="low")
    assert await _apply(client, pid, "before") == "urgent"  # topmost A wins

    # Promote B to the top → it now wins.
    reordered = await _order(client, pid, [b["id"], a["id"]])
    assert reordered.status_code == 200, reordered.text
    assert [r["id"] for r in reordered.json()["items"]] == [b["id"], a["id"]]
    assert await _apply(client, pid, "after") == "low"


async def test_specificity_beats_position(client, project):
    """A matched conditional rule wins even when an unconditional rule is above
    it in the order (specificity-first is not overridden by position)."""
    pid = project["id"]
    await _rule(client, pid, name="무조건", action_value="high")  # position 0 (topmost)
    await _rule(
        client,
        pid,
        name="조건부",
        action_value="urgent",
        condition_field="type",
        condition_value="bug",
    )  # position 1
    bug = await create_wp(client, pid, subject="버그", type="bug", priority="none")
    res = await client.patch(
        f"/api/v1/work-packages/{bug['id']}",
        json={"expected_version": bug["version"], "status": "done"},
    )
    assert res.json()["priority"] == "urgent"  # conditional wins despite lower position


async def test_cross_trigger_position(client, project):
    """Rules on DIFFERENT triggers writing the same field merge in one global
    order — position decides the winner (v82.1 R1-②)."""
    pid = project["id"]
    s = await _rule(
        client,
        pid,
        name="상태",
        trigger_type="status_changed_to",
        trigger_value="done",
        action_value="high",
    )
    t = await _rule(
        client,
        pid,
        name="타입",
        trigger_type="type_changed_to",
        trigger_value="bug",
        action_value="urgent",
    )
    wp = await create_wp(client, pid, subject="교차", priority="none")
    # Both triggers fire in one PATCH; topmost (status, position 0) wins.
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": wp["version"], "status": "done", "type": "bug"},
    )
    assert res.json()["priority"] == "high"

    # Promote the type rule → it now wins the shared field.
    await _order(client, pid, [t["id"], s["id"]])
    wp2 = await create_wp(client, pid, subject="교차2", priority="none")
    res = await client.patch(
        f"/api/v1/work-packages/{wp2['id']}",
        json={"expected_version": wp2["version"], "status": "done", "type": "bug"},
    )
    assert res.json()["priority"] == "urgent"


async def test_order_authz_and_validation(client, project, member_project, foreign_project):
    pid = project["id"]
    a = await _rule(client, pid, name="A")
    b = await _rule(client, pid, name="B")

    # owner, exact set → 200
    assert (await _order(client, pid, [b["id"], a["id"]])).status_code == 200
    # set mismatch (missing one) → 422
    assert (await _order(client, pid, [a["id"]])).status_code == 422

    # member (not owner) → 403
    assert (await _order(client, str(member_project["project_id"]), [])).status_code == 403
    # non-member project → 404 (existence-hidden)
    assert (await _order(client, str(foreign_project["project_id"]), [])).status_code == 404

    # archived project → write gate 409
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (await _order(client, pid, [a["id"], b["id"]])).status_code == 409
    await client.post(f"/api/v1/projects/{pid}/unarchive")
