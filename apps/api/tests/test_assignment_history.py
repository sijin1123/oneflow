"""Cycle/module assignment history (Pass 71 PR-CJ, v71.1).

Activities are a DISPLAY LOG: cycle/module/milestone changes store the NAME
at change time (deletion/rename/cross-project move can never distort past
rows — R1-①); rollover records one snapshot activity per moved WP in a
single transaction (R1-④); the activity field filter accepts the new keys.
"""

import datetime as dt

from tests.conftest import create_project, create_wp


async def _mk(client, pid, kind, name):
    if kind == "cycle":
        today = dt.date(2026, 7, 1)
        res = await client.post(
            f"/api/v1/projects/{pid}/cycles",
            json={
                "name": name,
                "start_date": str(today),
                "end_date": str(today + dt.timedelta(days=13)),
            },
        )
    else:
        res = await client.post(f"/api/v1/projects/{pid}/modules", json={"name": name})
    assert res.status_code == 201, res.text
    return res.json()


async def _activities(client, wp_id, field=None):
    q = f"?field={field}" if field else ""
    res = await client.get(f"/api/v1/work-packages/{wp_id}/activities{q}")
    assert res.status_code == 200, res.text
    return res.json()["items"]


async def test_cycle_and_module_changes_record_name_snapshots(client):
    project = await create_project(client, key="AH1")
    pid = project["id"]
    c1 = await _mk(client, pid, "cycle", "스프린트 1")
    c2 = await _mk(client, pid, "cycle", "스프린트 2")
    mod = await _mk(client, pid, "module", "결제 모듈")
    wp = await create_wp(client, pid, subject="이력 대상")

    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "cycle_id": c1["id"], "module_id": mod["id"]},
    )
    assert res.status_code == 200, res.text
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 1, "cycle_id": c2["id"], "module_id": None},
    )
    assert res.status_code == 200, res.text

    cyc = await _activities(client, wp["id"], field="cycle_id")
    assert [(a["old_value"], a["new_value"]) for a in cyc] == [
        (None, "스프린트 1"),
        ("스프린트 1", "스프린트 2"),
    ]
    mods = await _activities(client, wp["id"], field="module_id")
    assert [(a["old_value"], a["new_value"]) for a in mods] == [
        (None, "결제 모듈"),
        ("결제 모듈", None),
    ]

    # Snapshot survives a rename AND a delete (display-log contract).
    res = await client.patch(
        f"/api/v1/projects/{pid}/cycles/{c1['id']}", json={"name": "개명된 스프린트"}
    )
    assert res.status_code == 200, res.text
    assert (await client.delete(f"/api/v1/projects/{pid}/modules/{mod['id']}")).status_code == 204
    cyc = await _activities(client, wp["id"], field="cycle_id")
    assert cyc[0]["new_value"] == "스프린트 1"  # not the new name
    mods = await _activities(client, wp["id"], field="module_id")
    assert mods[0]["new_value"] == "결제 모듈"  # not '삭제됨'/uuid


async def test_milestone_changes_store_names_now(client):
    project = await create_project(client, key="AH2")
    pid = project["id"]
    res = await client.post(
        f"/api/v1/projects/{pid}/milestones", json={"name": "v1 릴리스", "due_date": "2026-08-01"}
    )
    assert res.status_code == 201, res.text
    ms = res.json()
    wp = await create_wp(client, pid, subject="마일스톤 이력")
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "milestone_id": ms["id"]},
    )
    assert res.status_code == 200
    rows = await _activities(client, wp["id"], field="milestone_id")
    assert [(a["old_value"], a["new_value"]) for a in rows] == [(None, "v1 릴리스")]


async def test_rollover_records_per_wp_snapshot_activities(client):
    project = await create_project(client, key="AH3")
    pid = project["id"]
    c1 = await _mk(client, pid, "cycle", "이번 스프린트")
    c2 = await _mk(client, pid, "cycle", "다음 스프린트")
    open_wp = await create_wp(client, pid, subject="미완료", cycle_id=c1["id"])
    done_wp = await create_wp(client, pid, subject="완료", cycle_id=c1["id"])
    res = await client.patch(
        f"/api/v1/work-packages/{done_wp['id']}",
        json={"expected_version": 0, "status": "done"},
    )
    assert res.status_code == 200

    res = await client.post(
        f"/api/v1/projects/{pid}/cycles/{c1['id']}/rollover",
        json={"target_cycle_id": c2["id"]},
    )
    assert res.status_code == 200, res.text
    assert res.json()["moved"] == 1

    rows = await _activities(client, open_wp["id"], field="cycle_id")
    # create_wp with cycle set records nothing (created action) — rollover adds one.
    assert [(a["old_value"], a["new_value"]) for a in rows] == [("이번 스프린트", "다음 스프린트")]
    assert await _activities(client, done_wp["id"], field="cycle_id") == []


async def test_existing_field_history_regression(client):
    """The snapshot helper must not disturb non-reference fields."""
    project = await create_project(client, key="AH4")
    wp = await create_wp(client, project["id"], subject="회귀")
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "status": "in_progress", "subject": "회귀2"},
    )
    assert res.status_code == 200
    rows = await _activities(client, wp["id"])
    fields = {a["field"] for a in rows if a["action"] == "field_changed"}
    assert fields == {"status", "subject"}
