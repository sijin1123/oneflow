"""Project lifecycle phase API contracts (UI-109)."""

import asyncio

from app.api.v1 import project_phases as project_phases_api
from tests.conftest import create_project


async def test_list_synthesizes_ordered_defaults_and_is_member_scoped(
    client, member_project, foreign_project
):
    project = await create_project(client)
    response = await client.get(f"/api/v1/projects/{project['id']}/phases")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 4
    assert [item["key"] for item in body["items"]] == [
        "discover",
        "plan",
        "deliver",
        "close",
    ]
    assert [item["position"] for item in body["items"]] == [0, 1, 2, 3]
    assert [item["color"] for item in body["items"]] == [
        "sky",
        "indigo",
        "emerald",
        "amber",
    ]
    assert all(
        item["active"] is False
        and item["start_date"] is None
        and item["end_date"] is None
        and item["start_gate"]["active"] is False
        and item["start_gate"]["date"] is None
        and item["finish_gate"]["active"] is False
        and item["finish_gate"]["date"] is None
        and item["version"] == 0
        for item in body["items"]
    )
    assert body["items"][0]["start_gate"] == {
        "kind": "start",
        "name": "발견 시작 게이트",
        "active": False,
        "date": None,
    }
    assert body["items"][0]["finish_gate"]["name"] == "발견 완료 게이트"

    member = await client.get(f"/api/v1/projects/{member_project['project_id']}/phases")
    assert member.status_code == 200
    hidden = await client.get(f"/api/v1/projects/{foreign_project['project_id']}/phases")
    assert hidden.status_code == 404


async def test_owner_update_supports_partial_dates_noop_conflict_and_preserved_deactivation(client):
    project = await create_project(client)
    url = f"/api/v1/projects/{project['id']}/phases/discover"

    partial = await client.patch(
        url,
        json={
            "active": True,
            "start_date": "2026-07-01",
            "start_gate_active": True,
            "finish_gate_active": True,
            "version": 0,
        },
    )
    assert partial.status_code == 200
    assert partial.json() == {
        "key": "discover",
        "name": "발견",
        "color": "sky",
        "position": 0,
        "active": True,
        "start_date": "2026-07-01",
        "end_date": None,
        "start_gate": {
            "kind": "start",
            "name": "발견 시작 게이트",
            "active": True,
            "date": "2026-07-01",
        },
        "finish_gate": {
            "kind": "finish",
            "name": "발견 완료 게이트",
            "active": True,
            "date": None,
        },
        "version": 1,
    }

    no_op = await client.patch(
        url,
        json={"active": True, "start_gate_active": True, "version": 1},
    )
    assert no_op.status_code == 200
    assert no_op.json()["version"] == 1

    stale = await client.patch(url, json={"end_date": "2026-07-10", "version": 0})
    assert stale.status_code == 409

    complete = await client.patch(url, json={"end_date": "2026-07-10", "version": 1})
    assert complete.status_code == 200
    assert complete.json()["version"] == 2
    assert complete.json()["finish_gate"]["date"] == "2026-07-10"

    cleared = await client.patch(url, json={"start_date": None, "version": 2})
    assert cleared.status_code == 200
    assert cleared.json()["start_date"] is None
    assert cleared.json()["end_date"] == "2026-07-10"
    assert cleared.json()["version"] == 3
    listed = await client.get(f"/api/v1/projects/{project['id']}/phases")
    assert listed.json()["items"][0] == cleared.json()

    inactive = await client.patch(url, json={"active": False, "version": 3})
    assert inactive.status_code == 200
    assert inactive.json()["active"] is False
    assert inactive.json()["start_date"] is None
    assert inactive.json()["end_date"] == "2026-07-10"
    assert inactive.json()["start_gate"]["active"] is True
    assert inactive.json()["finish_gate"]["active"] is True
    assert inactive.json()["start_gate"]["date"] is None
    assert inactive.json()["finish_gate"]["date"] is None
    assert inactive.json()["version"] == 4


async def test_phase_dates_follow_definition_order_and_validate_shape(client):
    project = await create_project(client)
    base = f"/api/v1/projects/{project['id']}/phases"

    discover = await client.patch(
        f"{base}/discover",
        json={
            "active": True,
            "start_date": "2026-07-01",
            "end_date": "2026-07-10",
            "version": 0,
        },
    )
    assert discover.status_code == 200

    overlap = await client.patch(
        f"{base}/plan",
        json={
            "active": True,
            "start_date": "2026-07-10",
            "end_date": "2026-07-20",
            "version": 0,
        },
    )
    assert overlap.status_code == 422

    ordered = await client.patch(
        f"{base}/plan",
        json={
            "active": True,
            "start_date": "2026-07-11",
            "end_date": "2026-07-20",
            "version": 0,
        },
    )
    assert ordered.status_code == 200

    reverse = await client.patch(
        f"{base}/deliver",
        json={
            "active": True,
            "start_date": "2026-08-10",
            "end_date": "2026-08-01",
            "version": 0,
        },
    )
    assert reverse.status_code == 422

    unknown = await client.patch(f"{base}/unknown", json={"active": True, "version": 0})
    assert unknown.status_code == 404
    null_active = await client.patch(f"{base}/close", json={"active": None, "version": 0})
    assert null_active.status_code == 422
    null_gate = await client.patch(f"{base}/close", json={"start_gate_active": None, "version": 0})
    assert null_gate.status_code == 422


async def test_finish_change_reschedules_active_successors_on_working_days(client):
    project = await create_project(client)
    base = f"/api/v1/projects/{project['id']}/phases"

    for key, start_date, end_date in [
        ("discover", "2026-06-29", "2026-07-03"),
        ("plan", "2026-07-06", "2026-07-10"),
        ("deliver", "2026-07-13", "2026-07-15"),
    ]:
        payload = {
            "active": True,
            "start_date": start_date,
            "end_date": end_date,
            "version": 0,
        }
        if key == "deliver":
            payload["finish_gate_active"] = True
        response = await client.patch(
            f"{base}/{key}",
            json=payload,
        )
        assert response.status_code == 200

    changed = await client.patch(f"{base}/discover", json={"end_date": "2026-07-10", "version": 1})
    assert changed.status_code == 200
    phases = (await client.get(base)).json()["items"]
    assert [
        (phase["key"], phase["start_date"], phase["end_date"], phase["version"]) for phase in phases
    ] == [
        ("discover", "2026-06-29", "2026-07-10", 2),
        ("plan", "2026-07-13", "2026-07-17", 2),
        ("deliver", "2026-07-20", "2026-07-22", 2),
        ("close", None, None, 0),
    ]
    assert phases[2]["finish_gate"]["date"] == "2026-07-22"

    backward = await client.patch(f"{base}/discover", json={"end_date": "2026-07-03", "version": 2})
    assert backward.status_code == 200
    phases = (await client.get(base)).json()["items"]
    assert [
        (phase["key"], phase["start_date"], phase["end_date"], phase["version"])
        for phase in phases[:3]
    ] == [
        ("discover", "2026-06-29", "2026-07-03", 3),
        ("plan", "2026-07-06", "2026-07-10", 3),
        ("deliver", "2026-07-13", "2026-07-15", 3),
    ]


async def test_finish_change_uses_workspace_weekdays_and_holidays(client):
    calendar = await client.patch(
        "/api/v1/admin/workspace/calendar",
        json={
            "working_weekdays": [0, 1, 2, 3, 4, 5],
            "holidays": ["2026-07-20"],
        },
        headers={"If-Match": '"1"'},
    )
    assert calendar.status_code == 200, calendar.text
    project = await create_project(client)
    base = f"/api/v1/projects/{project['id']}/phases"
    source = await client.patch(
        f"{base}/discover",
        json={
            "active": True,
            "start_date": "2026-07-13",
            "end_date": "2026-07-16",
            "version": 0,
        },
    )
    assert source.status_code == 200
    successor = await client.patch(
        f"{base}/plan",
        json={
            "active": True,
            "start_date": "2026-07-20",
            "end_date": "2026-07-24",
            "version": 0,
        },
    )
    assert successor.status_code == 200

    changed = await client.patch(f"{base}/discover", json={"end_date": "2026-07-17", "version": 1})
    assert changed.status_code == 200
    phases = {phase["key"]: phase for phase in (await client.get(base)).json()["items"]}
    assert phases["plan"]["start_date"] == "2026-07-18"
    assert phases["plan"]["end_date"] == "2026-07-23"


async def test_activation_reschedules_complete_phase_and_successors_with_workspace_calendar(
    client,
):
    calendar = await client.patch(
        "/api/v1/admin/workspace/calendar",
        json={
            "working_weekdays": [0, 1, 2, 3, 4],
            "holidays": ["2026-07-20"],
        },
        headers={"If-Match": '"1"'},
    )
    assert calendar.status_code == 200, calendar.text
    project = await create_project(client)
    base = f"/api/v1/projects/{project['id']}/phases"
    for key, active, start_date, end_date in [
        ("discover", True, "2026-07-13", "2026-07-17"),
        ("plan", False, "2026-07-13", "2026-07-17"),
        ("deliver", True, "2026-07-21", "2026-07-22"),
        ("close", True, "2026-08-03", None),
    ]:
        response = await client.patch(
            f"{base}/{key}",
            json={
                "active": active,
                "start_date": start_date,
                "end_date": end_date,
                "version": 0,
            },
        )
        assert response.status_code == 200, response.text

    activated = await client.patch(f"{base}/plan", json={"active": True, "version": 1})
    assert activated.status_code == 200, activated.text
    assert (
        activated.json()["start_date"],
        activated.json()["end_date"],
        activated.json()["version"],
    ) == ("2026-07-21", "2026-07-27", 2)
    phases = {phase["key"]: phase for phase in (await client.get(base)).json()["items"]}
    assert (
        phases["deliver"]["start_date"],
        phases["deliver"]["end_date"],
        phases["deliver"]["version"],
    ) == ("2026-07-28", "2026-07-29", 2)
    assert (
        phases["close"]["start_date"],
        phases["close"]["end_date"],
        phases["close"]["version"],
    ) == ("2026-08-03", None, 1)


async def test_activation_preserves_partial_or_unanchored_schedules_and_overflow_is_atomic(client):
    project = await create_project(client)
    base = f"/api/v1/projects/{project['id']}/phases"
    partial = await client.patch(
        f"{base}/plan",
        json={"active": False, "start_date": "2026-07-13", "version": 0},
    )
    assert partial.status_code == 200
    partial_activation = await client.patch(f"{base}/plan", json={"active": True, "version": 1})
    assert partial_activation.status_code == 200
    assert partial_activation.json()["start_date"] == "2026-07-13"
    assert partial_activation.json()["end_date"] is None

    unanchored = await client.patch(
        f"{base}/close",
        json={
            "active": False,
            "start_date": "2026-08-03",
            "end_date": "2026-08-07",
            "version": 0,
        },
    )
    assert unanchored.status_code == 200
    unanchored_activation = await client.patch(f"{base}/close", json={"active": True, "version": 1})
    assert unanchored_activation.status_code == 200
    assert unanchored_activation.json()["start_date"] == "2026-08-03"
    assert unanchored_activation.json()["end_date"] == "2026-08-07"

    weekend_project = await create_project(client, key="WEEKEND", name="주말 단계")
    weekend = f"/api/v1/projects/{weekend_project['id']}/phases"
    for key, active, start_date, end_date in [
        ("discover", True, "2026-07-13", "2026-07-17"),
        ("plan", False, "2026-07-18", "2026-07-19"),
        ("deliver", True, "2026-07-20", "2026-07-22"),
    ]:
        response = await client.patch(
            f"{weekend}/{key}",
            json={
                "active": active,
                "start_date": start_date,
                "end_date": end_date,
                "version": 0,
            },
        )
        assert response.status_code == 200, response.text
    weekend_activation = await client.patch(f"{weekend}/plan", json={"active": True, "version": 1})
    assert weekend_activation.status_code == 200
    assert weekend_activation.json()["start_date"] == "2026-07-18"
    assert weekend_activation.json()["end_date"] == "2026-07-19"
    weekend_phases = {phase["key"]: phase for phase in (await client.get(weekend)).json()["items"]}
    assert weekend_phases["deliver"]["start_date"] == "2026-07-20"
    assert weekend_phases["deliver"]["version"] == 1

    boundary_project = await create_project(client, key="ACTMAX", name="활성화 날짜 경계")
    boundary = f"/api/v1/projects/{boundary_project['id']}/phases"
    predecessor = await client.patch(
        f"{boundary}/discover",
        json={
            "active": True,
            "start_date": "9999-12-30",
            "end_date": "9999-12-31",
            "version": 0,
        },
    )
    assert predecessor.status_code == 200
    stored = await client.patch(
        f"{boundary}/plan",
        json={
            "active": False,
            "start_date": "9999-12-31",
            "end_date": "9999-12-31",
            "version": 0,
        },
    )
    assert stored.status_code == 200
    rejected = await client.patch(f"{boundary}/plan", json={"active": True, "version": 1})
    assert rejected.status_code == 422
    assert rejected.json()["detail"] == "rescheduled phase dates exceed the supported range"
    unchanged = {phase["key"]: phase for phase in (await client.get(boundary)).json()["items"]}
    assert unchanged["plan"]["active"] is False
    assert unchanged["plan"]["start_date"] == "9999-12-31"
    assert unchanged["plan"]["version"] == 1


async def test_finish_change_skips_inactive_and_stops_at_partial_successor(client):
    project = await create_project(client)
    base = f"/api/v1/projects/{project['id']}/phases"
    discover = await client.patch(
        f"{base}/discover",
        json={"active": True, "start_date": "2026-07-06", "end_date": "2026-07-10", "version": 0},
    )
    assert discover.status_code == 200
    inactive = await client.patch(
        f"{base}/plan",
        json={"active": False, "start_date": "2026-07-13", "end_date": "2026-07-17", "version": 0},
    )
    assert inactive.status_code == 200
    partial = await client.patch(
        f"{base}/deliver", json={"active": True, "start_date": "2026-07-13", "version": 0}
    )
    assert partial.status_code == 200
    untouched = await client.patch(
        f"{base}/close",
        json={"active": True, "start_date": "2026-08-03", "end_date": "2026-08-07", "version": 0},
    )
    assert untouched.status_code == 200

    changed = await client.patch(f"{base}/discover", json={"end_date": "2026-07-17", "version": 1})
    assert changed.status_code == 200
    phases = {phase["key"]: phase for phase in (await client.get(base)).json()["items"]}
    assert (
        phases["plan"]["start_date"],
        phases["plan"]["end_date"],
        phases["plan"]["version"],
    ) == (
        "2026-07-13",
        "2026-07-17",
        1,
    )
    assert (
        phases["deliver"]["start_date"],
        phases["deliver"]["end_date"],
        phases["deliver"]["version"],
    ) == (
        "2026-07-20",
        None,
        2,
    )
    assert (
        phases["close"]["start_date"],
        phases["close"]["end_date"],
        phases["close"]["version"],
    ) == (
        "2026-08-03",
        "2026-08-07",
        1,
    )

    cleared = await client.patch(f"{base}/discover", json={"end_date": None, "version": 2})
    assert cleared.status_code == 200
    direct_start = await client.patch(
        f"{base}/discover", json={"start_date": "2026-07-07", "version": 3}
    )
    assert direct_start.status_code == 200
    phases = {phase["key"]: phase for phase in (await client.get(base)).json()["items"]}
    assert phases["deliver"]["start_date"] == "2026-07-20"


async def test_inactive_source_does_not_reschedule_and_overflow_is_atomic(client):
    project = await create_project(client)
    base = f"/api/v1/projects/{project['id']}/phases"
    inactive = await client.patch(
        f"{base}/discover",
        json={
            "active": False,
            "start_date": "2026-07-06",
            "end_date": "2026-07-10",
            "version": 0,
        },
    )
    assert inactive.status_code == 200
    successor = await client.patch(
        f"{base}/plan",
        json={
            "active": True,
            "start_date": "2026-07-13",
            "end_date": "2026-07-17",
            "version": 0,
        },
    )
    assert successor.status_code == 200
    changed = await client.patch(f"{base}/discover", json={"end_date": "2026-07-24", "version": 1})
    assert changed.status_code == 200
    phases = {phase["key"]: phase for phase in (await client.get(base)).json()["items"]}
    assert phases["plan"]["start_date"] == "2026-07-13"
    assert phases["plan"]["version"] == 1

    boundary_project = await create_project(client, key="MAX", name="날짜 경계")
    boundary = f"/api/v1/projects/{boundary_project['id']}/phases"
    root = await client.patch(
        f"{boundary}/discover",
        json={
            "active": True,
            "start_date": "9999-12-29",
            "end_date": "9999-12-30",
            "version": 0,
        },
    )
    assert root.status_code == 200
    end_phase = await client.patch(
        f"{boundary}/plan",
        json={
            "active": True,
            "start_date": "9999-12-31",
            "end_date": "9999-12-31",
            "version": 0,
        },
    )
    assert end_phase.status_code == 200
    rejected = await client.patch(
        f"{boundary}/discover", json={"end_date": "9999-12-31", "version": 1}
    )
    assert rejected.status_code == 422
    assert rejected.json()["detail"] == "rescheduled phase dates exceed the supported range"
    unchanged = {phase["key"]: phase for phase in (await client.get(boundary)).json()["items"]}
    assert unchanged["discover"]["end_date"] == "9999-12-30"
    assert unchanged["discover"]["version"] == 1
    assert unchanged["plan"]["start_date"] == "9999-12-31"
    assert unchanged["plan"]["version"] == 1


async def test_phase_mutation_is_owner_only_and_archived_projects_are_read_only(
    client, member_project
):
    denied = await client.patch(
        f"/api/v1/projects/{member_project['project_id']}/phases/plan",
        json={"active": True, "version": 0},
    )
    assert denied.status_code == 403

    project = await create_project(client, key="ARC", name="보관 수명주기")
    archived = await client.post(f"/api/v1/projects/{project['id']}/archive")
    assert archived.status_code == 200
    locked = await client.patch(
        f"/api/v1/projects/{project['id']}/phases/plan",
        json={"active": True, "version": 0},
    )
    assert locked.status_code == 409

    visible = await client.get(f"/api/v1/projects/{project['id']}/phases")
    assert visible.status_code == 200
    assert all(item["active"] is False for item in visible.json()["items"])


async def test_archive_committed_after_role_guard_blocks_phase_write(client, monkeypatch):
    project = await create_project(client, key="RACE", name="보관 경쟁")
    guard_passed = asyncio.Event()
    continue_write = asyncio.Event()
    original = project_phases_api.require_role

    async def paused_require_role(session, project_id, user, roles, *, write=False):
        role = await original(session, project_id, user, roles, write=write)
        guard_passed.set()
        await continue_write.wait()
        return role

    monkeypatch.setattr(project_phases_api, "require_role", paused_require_role)
    write = asyncio.create_task(
        client.patch(
            f"/api/v1/projects/{project['id']}/phases/plan",
            json={"active": True, "version": 0},
        )
    )
    await asyncio.wait_for(guard_passed.wait(), timeout=2)
    archived = await client.post(f"/api/v1/projects/{project['id']}/archive")
    assert archived.status_code == 200
    continue_write.set()

    blocked = await asyncio.wait_for(write, timeout=2)
    assert blocked.status_code == 409
    assert blocked.json()["detail"] == "project is archived"
    visible = await client.get(f"/api/v1/projects/{project['id']}/phases")
    assert all(item["active"] is False for item in visible.json()["items"])


async def test_workspace_definitions_propagate_without_mutating_project_phase_state(client):
    first = await create_project(client, key="PHASEA", name="단계 정의 A")
    second = await create_project(client, key="PHASEB", name="단계 정의 B")
    first_base = f"/api/v1/projects/{first['id']}/phases"
    stored = await client.patch(
        f"{first_base}/discover",
        json={
            "active": True,
            "start_date": "2026-07-01",
            "end_date": "2026-07-10",
            "start_gate_active": True,
            "finish_gate_active": True,
            "version": 0,
        },
    )
    assert stored.status_code == 200, stored.text

    updated = await client.patch(
        "/api/v1/admin/workspace/project-phase-definitions",
        json={
            "items": [
                {"key": "plan", "name": "설계", "color": "amber"},
                {"key": "discover", "name": "탐색", "color": "emerald"},
                {"key": "deliver", "name": "구현", "color": "indigo"},
                {"key": "close", "name": "종료", "color": "sky"},
            ]
        },
        headers={"If-Match": '"1"'},
    )
    assert updated.status_code == 200, updated.text

    for project in (first, second):
        response = await client.get(f"/api/v1/projects/{project['id']}/phases")
        assert response.status_code == 200
        assert [
            (item["key"], item["name"], item["color"], item["position"])
            for item in response.json()["items"]
        ] == [
            ("plan", "설계", "amber", 0),
            ("discover", "탐색", "emerald", 1),
            ("deliver", "구현", "indigo", 2),
            ("close", "종료", "sky", 3),
        ]

    preserved = {item["key"]: item for item in (await client.get(first_base)).json()["items"]}[
        "discover"
    ]
    assert preserved["active"] is True
    assert preserved["start_date"] == "2026-07-01"
    assert preserved["end_date"] == "2026-07-10"
    assert preserved["start_gate"] == {
        "kind": "start",
        "name": "탐색 시작 게이트",
        "active": True,
        "date": "2026-07-01",
    }
    assert preserved["finish_gate"] == {
        "kind": "finish",
        "name": "탐색 완료 게이트",
        "active": True,
        "date": "2026-07-10",
    }
    assert preserved["version"] == 1


async def test_phase_scheduler_uses_workspace_definition_order(client):
    definitions = await client.patch(
        "/api/v1/admin/workspace/project-phase-definitions",
        json={
            "items": [
                {"key": "plan", "name": "설계", "color": "indigo"},
                {"key": "discover", "name": "탐색", "color": "sky"},
                {"key": "deliver", "name": "구현", "color": "emerald"},
                {"key": "close", "name": "종료", "color": "amber"},
            ]
        },
        headers={"If-Match": '"1"'},
    )
    assert definitions.status_code == 200, definitions.text
    project = await create_project(client, key="ORDER", name="단계 순서")
    base = f"/api/v1/projects/{project['id']}/phases"
    for key, start_date, end_date in [
        ("plan", "2026-07-06", "2026-07-10"),
        ("discover", "2026-07-13", "2026-07-17"),
    ]:
        response = await client.patch(
            f"{base}/{key}",
            json={
                "active": True,
                "start_date": start_date,
                "end_date": end_date,
                "version": 0,
            },
        )
        assert response.status_code == 200, response.text

    moved = await client.patch(
        f"{base}/plan",
        json={"end_date": "2026-07-17", "version": 1},
    )
    assert moved.status_code == 200, moved.text
    phases = (await client.get(base)).json()["items"]
    assert [(phase["key"], phase["position"]) for phase in phases] == [
        ("plan", 0),
        ("discover", 1),
        ("deliver", 2),
        ("close", 3),
    ]
    by_key = {phase["key"]: phase for phase in phases}
    assert by_key["discover"]["start_date"] == "2026-07-20"
    assert by_key["discover"]["end_date"] == "2026-07-24"
    assert by_key["discover"]["version"] == 2
