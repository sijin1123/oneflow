"""Cycles/sprints (expansion PLAN Pass 1 PR-C).

Covers the validator-required contract: owner-only management vs member
assignment, derived status boundaries, merged-range date validation, the
composite same-project FK (API 422 AND raw-SQL rejection), column-list
SET NULL on delete, progress rollups, and the CSV import whitelist."""

from datetime import date, timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.core.dates import utc_today
from app.models import WorkPackage
from tests.conftest import create_project, create_wp

TODAY = utc_today()  # derived status boundaries are UTC (Pass 46)


def _iso(d: date) -> str:
    return d.isoformat()


async def create_cycle(client, project_id, name="스프린트 1", **extra) -> dict:
    body = {
        "name": name,
        "start_date": _iso(TODAY - timedelta(days=1)),
        "end_date": _iso(TODAY + timedelta(days=13)),
        **extra,
    }
    res = await client.post(f"/api/v1/projects/{project_id}/cycles", json=body)
    assert res.status_code == 201, res.text
    return res.json()


@pytest.fixture
async def project(client):
    return await create_project(client, key="CYC", name="사이클 프로젝트")


async def test_crud_and_derived_status_boundaries(client, project):
    pid = project["id"]
    active = await create_cycle(
        client, pid, name="경계-활성", start_date=_iso(TODAY), end_date=_iso(TODAY)
    )
    upcoming = await create_cycle(
        client,
        pid,
        name="예정",
        start_date=_iso(TODAY + timedelta(days=1)),
        end_date=_iso(TODAY + timedelta(days=14)),
    )
    completed = await create_cycle(
        client,
        pid,
        name="완료",
        start_date=_iso(TODAY - timedelta(days=14)),
        end_date=_iso(TODAY - timedelta(days=1)),
    )
    # start == today == end → active (inclusive boundaries)
    assert active["status"] == "active"
    assert upcoming["status"] == "upcoming"
    assert completed["status"] == "completed"

    res = await client.get(f"/api/v1/projects/{pid}/cycles")
    body = res.json()
    assert body["total"] == 3

    res = await client.patch(
        f"/api/v1/projects/{pid}/cycles/{active['id']}", json={"name": "이름 변경"}
    )
    assert res.status_code == 200
    assert res.json()["name"] == "이름 변경"

    res = await client.delete(f"/api/v1/projects/{pid}/cycles/{upcoming['id']}")
    assert res.status_code == 204
    res = await client.get(f"/api/v1/projects/{pid}/cycles")
    assert res.json()["total"] == 2


async def test_date_validation_on_create_and_merged_patch(client, project):
    pid = project["id"]
    res = await client.post(
        f"/api/v1/projects/{pid}/cycles",
        json={
            "name": "역전",
            "start_date": _iso(TODAY),
            "end_date": _iso(TODAY - timedelta(days=1)),
        },
    )
    assert res.status_code == 422

    c = await create_cycle(client, pid)
    # Changing only end_date below the existing start_date must fail (merged check).
    res = await client.patch(
        f"/api/v1/projects/{pid}/cycles/{c['id']}",
        json={"end_date": _iso(date.fromisoformat(c["start_date"]) - timedelta(days=1))},
    )
    assert res.status_code == 422
    # Explicit nulls on required fields are clean 422s, not 500s.
    res = await client.patch(f"/api/v1/projects/{pid}/cycles/{c['id']}", json={"name": None})
    assert res.status_code == 422


async def test_permission_matrix(client, member_project, foreign_project):
    shared = str(member_project["project_id"])
    # Plain member: can read, cannot manage (403).
    res = await client.get(f"/api/v1/projects/{shared}/cycles")
    assert res.status_code == 200
    res = await client.post(
        f"/api/v1/projects/{shared}/cycles",
        json={"name": "멤버 시도", "start_date": _iso(TODAY), "end_date": _iso(TODAY)},
    )
    assert res.status_code == 403

    # Non-member: existence hidden (404) for read AND manage.
    foreign = str(foreign_project["project_id"])
    res = await client.get(f"/api/v1/projects/{foreign}/cycles")
    assert res.status_code == 404
    res = await client.post(
        f"/api/v1/projects/{foreign}/cycles",
        json={"name": "외부 시도", "start_date": _iso(TODAY), "end_date": _iso(TODAY)},
    )
    assert res.status_code == 404


async def test_assignment_progress_and_list_filter(client, project):
    pid = project["id"]
    c = await create_cycle(client, pid)
    wp1 = await create_wp(client, pid, subject="사이클 안 1", cycle_id=c["id"])
    wp2 = await create_wp(client, pid, subject="사이클 안 2 완료", cycle_id=c["id"], status="done")
    await create_wp(client, pid, subject="사이클 밖")

    # Member-level assignment via WP PATCH also works.
    wp3 = await create_wp(client, pid, subject="나중 배정")
    res = await client.patch(
        f"/api/v1/work-packages/{wp3['id']}",
        json={"expected_version": 0, "cycle_id": c["id"]},
    )
    assert res.status_code == 200, res.text
    assert res.json()["cycle_id"] == c["id"]

    # Progress rollup: 3 assigned, 1 closed.
    listed = (await client.get(f"/api/v1/projects/{pid}/cycles")).json()["items"]
    row = next(i for i in listed if i["id"] == c["id"])
    assert row["work_package_count"] == 3
    assert row["done_work_package_count"] == 1

    # List filter returns only the cycle's items.
    res = await client.get(f"/api/v1/projects/{pid}/work-packages", params={"cycle_id": c["id"]})
    subjects = {i["subject"] for i in res.json()["items"]}
    assert subjects == {"사이클 안 1", "사이클 안 2 완료", "나중 배정"}
    assert {wp1["id"], wp2["id"], wp3["id"]} == {i["id"] for i in res.json()["items"]}


async def test_cross_project_assignment_rejected_by_api_and_db(client, app, project):
    other = await create_project(client, key="OTH", name="다른 프로젝트")
    foreign_cycle = await create_cycle(client, other["id"], name="남의 사이클")

    wp = await create_wp(client, project["id"], subject="교차 시도")
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "cycle_id": foreign_cycle["id"]},
    )
    assert res.status_code == 422

    res = await client.post(
        f"/api/v1/projects/{project['id']}/work-packages",
        json={"subject": "교차 생성", "cycle_id": foreign_cycle["id"]},
    )
    assert res.status_code == 422

    # API-bypassing writes hit the composite FK: unrepresentable at the DB level.
    with pytest.raises(IntegrityError):
        async with app.state.sessionmaker() as session, session.begin():
            await session.execute(
                text(
                    "UPDATE work_packages SET cycle_id = CAST(:cid AS uuid) "
                    "WHERE id = CAST(:wid AS uuid)"
                ).bindparams(cid=foreign_cycle["id"], wid=wp["id"])
            )


async def test_delete_clears_only_cycle_id(client, app, project):
    pid = project["id"]
    c = await create_cycle(client, pid)
    wp = await create_wp(client, pid, subject="배정 후 삭제", cycle_id=c["id"])

    res = await client.delete(f"/api/v1/projects/{pid}/cycles/{c['id']}")
    assert res.status_code == 204

    async with app.state.sessionmaker() as session:
        row = (
            await session.execute(select(WorkPackage).where(WorkPackage.id == wp["id"]))
        ).scalar_one()
        # Column-list SET NULL: the assignment clears, the project link survives.
        assert row.cycle_id is None
        assert str(row.project_id) == pid


async def test_csv_import_cannot_smuggle_cycle_ids(client, app, project):
    other = await create_project(client, key="SMG", name="밀수 표적")
    foreign_cycle = await create_cycle(client, other["id"], name="표적 사이클")

    csv_content = f"subject,cycle_id\n밀수 행,{foreign_cycle['id']}\n"
    res = await client.post(
        f"/api/v1/projects/{project['id']}/work-packages/import",
        json={"content": csv_content, "dry_run": False},
    )
    assert res.status_code == 200, res.text
    assert res.json()["valid"] == 1

    async with app.state.sessionmaker() as session:
        row = (
            await session.execute(select(WorkPackage).where(WorkPackage.subject == "밀수 행"))
        ).scalar_one()
        # cycle_id is not an importable column — the value must be dropped.
        assert row.cycle_id is None
