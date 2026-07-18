"""Project schedule baseline lifecycle and variance contracts (UI-134)."""

from sqlalchemy import delete

from app.api.v1 import project_schedule_baselines as baseline_api
from app.models.work_package import WorkPackage
from tests.conftest import create_project, create_wp


async def _patch_dates(client, item: dict, **dates) -> dict:
    response = await client.patch(
        f"/api/v1/work-packages/{item['id']}",
        json={"expected_version": item["version"], **dates},
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_snapshot_reports_all_schedule_variance_states(client, app):
    project = await create_project(client)
    project_id = project["id"]
    unchanged = await create_wp(
        client, project_id, "변경 없음", start_date="2026-07-01", due_date="2026-07-05"
    )
    later = await create_wp(
        client, project_id, "지연 작업", start_date="2026-07-02", due_date="2026-07-06"
    )
    earlier = await create_wp(
        client, project_id, "앞당긴 작업", start_date="2026-07-03", due_date="2026-07-10"
    )
    unscheduled = await create_wp(
        client, project_id, "일정 제거", start_date="2026-07-04", due_date="2026-07-11"
    )
    rescheduled = await create_wp(client, project_id, "일정 추가")
    removed = await create_wp(
        client, project_id, "삭제된 작업", start_date="2026-07-05", due_date="2026-07-12"
    )

    captured = await client.put(
        f"/api/v1/projects/{project_id}/schedule-baseline",
        json={"expected_version": None},
    )
    assert captured.status_code == 200, captured.text
    assert captured.json()["baseline"]["version"] == 0
    assert captured.json()["unchanged"] == 6

    await _patch_dates(client, later, due_date="2026-07-08")
    await _patch_dates(client, earlier, due_date="2026-07-09")
    await _patch_dates(client, unscheduled, start_date=None, due_date=None)
    await _patch_dates(client, rescheduled, start_date="2026-07-06", due_date="2026-07-13")
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(delete(WorkPackage).where(WorkPackage.id == removed["id"]))
    added = await create_wp(
        client, project_id, "새 작업", start_date="2026-07-07", due_date="2026-07-14"
    )

    response = await client.get(f"/api/v1/projects/{project_id}/schedule-baseline")
    assert response.status_code == 200, response.text
    body = response.json()
    assert {
        key: body[key]
        for key in (
            "total_snapshot",
            "current_total",
            "unchanged",
            "later",
            "earlier",
            "unscheduled",
            "rescheduled",
            "added",
            "removed",
            "changed_total",
        )
    } == {
        "total_snapshot": 6,
        "current_total": 6,
        "unchanged": 1,
        "later": 1,
        "earlier": 1,
        "unscheduled": 1,
        "rescheduled": 1,
        "added": 1,
        "removed": 1,
        "changed_total": 6,
    }
    by_subject = {item["subject"]: item for item in body["items"]}
    assert by_subject["지연 작업"]["variance_days"] == 2
    assert by_subject["앞당긴 작업"]["variance_days"] == -1
    assert by_subject["일정 제거"]["state"] == "unscheduled"
    assert by_subject["일정 추가"]["state"] == "rescheduled"
    assert by_subject["삭제된 작업"]["state"] == "removed"
    assert by_subject["새 작업"]["work_package_id"] == added["id"]
    assert unchanged["id"] not in {item["work_package_id"] for item in body["items"]}

    trend = await client.get(f"/api/v1/projects/{project_id}/schedule-baselines")
    assert trend.status_code == 200, trend.text
    assert trend.json()["items"] == [
        {
            **body["baseline"],
            "total_snapshot": 6,
            "comparison_total": 7,
            "changed_total": 6,
            "risk_total": 3,
        }
    ]


async def test_capture_refresh_delete_and_optimistic_version(client):
    project = await create_project(client)
    project_id = project["id"]
    await create_wp(client, project_id, "기준 작업")

    empty = await client.get(f"/api/v1/projects/{project_id}/schedule-baseline")
    assert empty.status_code == 200
    assert empty.json()["baseline"] is None
    assert empty.json()["current_total"] == 1

    created = await client.put(
        f"/api/v1/projects/{project_id}/schedule-baseline",
        json={"expected_version": None},
    )
    assert created.status_code == 200
    assert created.json()["baseline"]["version"] == 0
    assert created.json()["baseline"]["name"] == "기준선 1"

    refreshed = await client.put(
        f"/api/v1/projects/{project_id}/schedule-baseline",
        json={"expected_version": 0},
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["baseline"]["version"] == 1

    stale = await client.put(
        f"/api/v1/projects/{project_id}/schedule-baseline",
        json={"expected_version": 0},
    )
    assert stale.status_code == 409
    assert (
        await client.delete(
            f"/api/v1/projects/{project_id}/schedule-baseline",
            params={"expected_version": 0},
        )
    ).status_code == 409
    deleted = await client.delete(
        f"/api/v1/projects/{project_id}/schedule-baseline",
        params={"expected_version": 1},
    )
    assert deleted.status_code == 204
    assert (await client.get(f"/api/v1/projects/{project_id}/schedule-baseline")).json()[
        "baseline"
    ] is None


async def test_named_history_lists_compares_and_deletes_independent_snapshots(client):
    project = await create_project(client)
    project_id = project["id"]
    item = await create_wp(
        client,
        project_id,
        "릴리스 준비",
        start_date="2026-07-01",
        due_date="2026-07-10",
    )

    first = await client.post(
        f"/api/v1/projects/{project_id}/schedule-baselines",
        json={"name": "착수 기준"},
    )
    assert first.status_code == 201, first.text
    assert first.json()["baseline"]["name"] == "착수 기준"
    first_id = first.json()["baseline"]["id"]

    item = await _patch_dates(client, item, due_date="2026-07-13")
    second = await client.post(
        f"/api/v1/projects/{project_id}/schedule-baselines",
        json={"name": "Release 기준"},
    )
    assert second.status_code == 201, second.text
    second_id = second.json()["baseline"]["id"]
    assert second_id != first_id

    item = await _patch_dates(client, item, due_date="2026-07-15")
    history = await client.get(f"/api/v1/projects/{project_id}/schedule-baselines")
    assert history.status_code == 200, history.text
    assert history.json()["total"] == 2
    assert history.json()["current_total"] == 1
    assert history.json()["limit"] == 20
    assert [entry["name"] for entry in history.json()["items"]] == [
        "Release 기준",
        "착수 기준",
    ]
    assert [entry["total_snapshot"] for entry in history.json()["items"]] == [1, 1]
    assert [entry["comparison_total"] for entry in history.json()["items"]] == [1, 1]
    assert [entry["changed_total"] for entry in history.json()["items"]] == [1, 1]
    assert [entry["risk_total"] for entry in history.json()["items"]] == [1, 1]

    first_detail = await client.get(f"/api/v1/projects/{project_id}/schedule-baselines/{first_id}")
    assert first_detail.status_code == 200, first_detail.text
    assert first_detail.json()["items"][0]["variance_days"] == 5
    second_detail = await client.get(
        f"/api/v1/projects/{project_id}/schedule-baselines/{second_id}"
    )
    assert second_detail.json()["items"][0]["variance_days"] == 2

    duplicate = await client.post(
        f"/api/v1/projects/{project_id}/schedule-baselines",
        json={"name": "  release   기준  "},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "schedule baseline name already exists"

    stale_delete = await client.delete(
        f"/api/v1/projects/{project_id}/schedule-baselines/{first_id}",
        params={"expected_version": 1},
    )
    assert stale_delete.status_code == 409

    deleted = await client.delete(
        f"/api/v1/projects/{project_id}/schedule-baselines/{first_id}",
        params={"expected_version": 0},
    )
    assert deleted.status_code == 204
    assert (
        await client.get(f"/api/v1/projects/{project_id}/schedule-baselines/{first_id}")
    ).status_code == 404
    assert (
        await client.get(f"/api/v1/projects/{project_id}/schedule-baselines/{second_id}")
    ).status_code == 200


async def test_history_member_read_owner_write_and_bounded_count(
    client, member_project, monkeypatch
):
    project_id = member_project["project_id"]
    root = f"/api/v1/projects/{project_id}/schedule-baselines"
    assert (await client.get(root)).status_code == 200
    assert (await client.post(root, json={"name": "멤버 기준"})).status_code == 403

    project = await create_project(client)
    own_root = f"/api/v1/projects/{project['id']}/schedule-baselines"
    created = await client.post(own_root, json={"name": "첫 기준"})
    assert created.status_code == 201
    monkeypatch.setattr(baseline_api, "BASELINE_HISTORY_LIMIT", 1)
    bounded = await client.post(own_root, json={"name": "둘째 기준"})
    assert bounded.status_code == 409
    assert "at most 1 entries" in bounded.json()["detail"]


async def test_member_read_owner_write_foreign_hiding_and_archive_guard(
    client, member_project, foreign_project
):
    member_url = f"/api/v1/projects/{member_project['project_id']}/schedule-baseline"
    assert (await client.get(member_url)).status_code == 200
    assert (await client.put(member_url, json={"expected_version": None})).status_code == 403
    assert (await client.delete(member_url, params={"expected_version": 0})).status_code == 403

    foreign_url = f"/api/v1/projects/{foreign_project['project_id']}/schedule-baseline"
    assert (await client.get(foreign_url)).status_code == 404

    project = await create_project(client)
    own_url = f"/api/v1/projects/{project['id']}/schedule-baseline"
    assert (await client.post(f"/api/v1/projects/{project['id']}/archive")).status_code == 200
    archived_write = await client.put(own_url, json={"expected_version": None})
    assert archived_write.status_code == 409
    assert archived_write.json()["detail"] == "project is archived"
    archived_history_write = await client.post(
        f"/api/v1/projects/{project['id']}/schedule-baselines",
        json={"name": "보관 후 기준"},
    )
    assert archived_history_write.status_code == 409
    assert archived_history_write.json()["detail"] == "project is archived"


async def test_baseline_item_limit_is_bounded(client, monkeypatch):
    project = await create_project(client)
    project_id = project["id"]
    await create_wp(client, project_id, "첫 작업")
    await create_wp(client, project_id, "둘째 작업")
    monkeypatch.setattr(baseline_api, "BASELINE_ITEM_LIMIT", 1)

    response = await client.put(
        f"/api/v1/projects/{project_id}/schedule-baseline",
        json={"expected_version": None},
    )
    assert response.status_code == 409
    assert "at most 1 work items" in response.json()["detail"]
