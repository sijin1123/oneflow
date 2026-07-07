"""Modules/feature groups (expansion PLAN Pass 1 PR-D).

Mirrors the reviewed cycles contract (owner management vs member assignment,
composite same-project FK, column-list SET NULL, progress rollups) plus the
module-specific pieces: explicit state machine values, optional date range,
and lead membership integrity."""

from datetime import timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.core.dates import utc_today
from app.models import WorkPackage
from tests.conftest import create_project, create_wp

TODAY = utc_today()


async def create_module(client, project_id, name="인증 모듈", **extra) -> dict:
    res = await client.post(f"/api/v1/projects/{project_id}/modules", json={"name": name, **extra})
    assert res.status_code == 201, res.text
    return res.json()


@pytest.fixture
async def project(client):
    return await create_project(client, key="MOD", name="모듈 프로젝트")


async def test_crud_state_and_validation(client, project):
    pid = project["id"]
    m = await create_module(client, pid)
    assert m["state"] == "planned"

    res = await client.patch(
        f"/api/v1/projects/{pid}/modules/{m['id']}", json={"state": "in_progress"}
    )
    assert res.status_code == 200
    assert res.json()["state"] == "in_progress"

    # Unknown state and null name are clean 422s.
    res = await client.patch(f"/api/v1/projects/{pid}/modules/{m['id']}", json={"state": "wat"})
    assert res.status_code == 422
    res = await client.patch(f"/api/v1/projects/{pid}/modules/{m['id']}", json={"name": None})
    assert res.status_code == 422

    # Optional dates: order binds only when both exist — merged-range check.
    res = await client.patch(
        f"/api/v1/projects/{pid}/modules/{m['id']}", json={"start_date": str(TODAY)}
    )
    assert res.status_code == 200
    res = await client.patch(
        f"/api/v1/projects/{pid}/modules/{m['id']}",
        json={"target_date": str(TODAY - timedelta(days=1))},
    )
    assert res.status_code == 422

    res = await client.delete(f"/api/v1/projects/{pid}/modules/{m['id']}")
    assert res.status_code == 204
    assert (await client.get(f"/api/v1/projects/{pid}/modules")).json()["total"] == 0


async def test_lead_membership_integrity(client, app, project, foreign_project):
    pid = project["id"]
    # A non-member (the stranger) cannot be lead — 422 at write time.
    res = await client.post(
        f"/api/v1/projects/{pid}/modules",
        json={"name": "리드 검증", "lead_id": str(foreign_project["user_id"])},
    )
    assert res.status_code == 422

    # The dev user (owner) is a member → allowed.
    me = (await client.get("/api/v1/me")).json()["id"]
    m = await create_module(client, pid, name="리드 있음", lead_id=me)
    assert m["lead_id"] == me


async def test_permission_matrix(client, member_project, foreign_project):
    shared = str(member_project["project_id"])
    assert (await client.get(f"/api/v1/projects/{shared}/modules")).status_code == 200
    res = await client.post(f"/api/v1/projects/{shared}/modules", json={"name": "멤버 시도"})
    assert res.status_code == 403

    foreign = str(foreign_project["project_id"])
    assert (await client.get(f"/api/v1/projects/{foreign}/modules")).status_code == 404
    res = await client.post(f"/api/v1/projects/{foreign}/modules", json={"name": "외부 시도"})
    assert res.status_code == 404


async def test_assignment_progress_and_list_filter(client, project):
    pid = project["id"]
    m = await create_module(client, pid)
    await create_wp(client, pid, subject="모듈 안 1", module_id=m["id"])
    await create_wp(client, pid, subject="모듈 안 2 완료", module_id=m["id"], status="done")
    await create_wp(client, pid, subject="모듈 밖")

    wp3 = await create_wp(client, pid, subject="나중 배정")
    res = await client.patch(
        f"/api/v1/work-packages/{wp3['id']}",
        json={"expected_version": 0, "module_id": m["id"]},
    )
    assert res.status_code == 200, res.text
    assert res.json()["module_id"] == m["id"]

    listed = (await client.get(f"/api/v1/projects/{pid}/modules")).json()["items"]
    row = next(i for i in listed if i["id"] == m["id"])
    assert row["work_package_count"] == 3
    assert row["done_work_package_count"] == 1

    res = await client.get(f"/api/v1/projects/{pid}/work-packages", params={"module_id": m["id"]})
    assert {i["subject"] for i in res.json()["items"]} == {
        "모듈 안 1",
        "모듈 안 2 완료",
        "나중 배정",
    }


async def test_cross_project_assignment_rejected_by_api_and_db(client, app, project):
    other = await create_project(client, key="OTM", name="다른 프로젝트")
    foreign_module = await create_module(client, other["id"], name="남의 모듈")

    wp = await create_wp(client, project["id"], subject="교차 시도")
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "module_id": foreign_module["id"]},
    )
    assert res.status_code == 422

    with pytest.raises(IntegrityError):
        async with app.state.sessionmaker() as session, session.begin():
            await session.execute(
                text(
                    "UPDATE work_packages SET module_id = CAST(:mid AS uuid) "
                    "WHERE id = CAST(:wid AS uuid)"
                ).bindparams(mid=foreign_module["id"], wid=wp["id"])
            )


async def test_delete_clears_only_module_id(client, app, project):
    pid = project["id"]
    m = await create_module(client, pid)
    wp = await create_wp(client, pid, subject="배정 후 삭제", module_id=m["id"])

    assert (await client.delete(f"/api/v1/projects/{pid}/modules/{m['id']}")).status_code == 204

    async with app.state.sessionmaker() as session:
        row = (
            await session.execute(select(WorkPackage).where(WorkPackage.id == wp["id"]))
        ).scalar_one()
        assert row.module_id is None
        assert str(row.project_id) == pid
