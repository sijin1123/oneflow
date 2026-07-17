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
