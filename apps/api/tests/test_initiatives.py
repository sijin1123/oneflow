"""Cross-project initiatives (expansion PLAN Pass 3 PR-L).

Contract: creator-only mutations; visibility = creator OR member of a
connected project; roll-ups aggregate ONLY the caller's member projects
(no cross-project leakage beyond the connection count)."""

from sqlalchemy import select

from app.models import Initiative, InitiativeProject, Project
from tests.conftest import create_project, create_wp


async def create_initiative(client, name="플랫폼 개편", **extra) -> dict:
    res = await client.post("/api/v1/initiatives", json={"name": name, **extra})
    assert res.status_code == 201, res.text
    return res.json()


async def connect(client, initiative_id, project_id):
    return await client.post(
        f"/api/v1/initiatives/{initiative_id}/projects", json={"project_id": project_id}
    )


async def test_create_connect_and_rollup(client, project_factory=None):
    a = await create_project(client, key="INIA", name="이니셔티브 A")
    b = await create_project(client, key="INIB", name="이니셔티브 B")
    await create_wp(client, a["id"], subject="A-1")
    await create_wp(client, a["id"], subject="A-2 완료", status="done")
    await create_wp(client, b["id"], subject="B-1")

    ini = await create_initiative(client)
    assert ini["is_mine"] is True
    assert ini["connected_project_count"] == 0

    assert (await connect(client, ini["id"], a["id"])).status_code == 200
    res = await connect(client, ini["id"], b["id"])
    assert res.status_code == 200
    body = res.json()
    assert body["connected_project_count"] == 2
    rollup = {p["project_name"]: p for p in body["projects"]}
    assert rollup["이니셔티브 A"]["work_package_count"] == 2
    assert rollup["이니셔티브 A"]["done_work_package_count"] == 1
    assert rollup["이니셔티브 B"]["work_package_count"] == 1

    # Duplicate connection → 409; disconnect works.
    assert (await connect(client, ini["id"], a["id"])).status_code == 409
    res = await client.delete(f"/api/v1/initiatives/{ini['id']}/projects/{a['id']}")
    assert res.status_code == 200
    assert res.json()["connected_project_count"] == 1


async def test_state_and_date_validation(client):
    res = await client.post("/api/v1/initiatives", json={"name": "이상", "state": "wat"})
    assert res.status_code == 422
    res = await client.post(
        "/api/v1/initiatives",
        json={"name": "역전", "start_date": "2026-09-01", "target_date": "2026-08-01"},
    )
    assert res.status_code == 422

    ini = await create_initiative(client, name="상태 전이")
    res = await client.patch(f"/api/v1/initiatives/{ini['id']}", json={"state": "in_progress"})
    assert res.status_code == 200
    assert res.json()["state"] == "in_progress"


async def test_visibility_via_membership_and_leak_guard(client, app, member_project):
    """The OWNER's initiative becomes visible to the dev member once a shared
    project is connected — but the roll-up hides projects the dev cannot see,
    and mutations stay creator-only (404)."""
    owner_id = member_project["owner_id"]
    shared_pid = member_project["project_id"]
    async with app.state.sessionmaker() as session, session.begin():
        # The owner's private project (dev is NOT a member).
        private = Project(key="PRIV", name="비공개 프로젝트")
        session.add(private)
        await session.flush()
        ini = Initiative(name="소유자 이니셔티브", owner_id=owner_id)
        session.add(ini)
        await session.flush()
        session.add(InitiativeProject(initiative_id=ini.id, project_id=private.id))
        ini_id = str(ini.id)

    # Not visible yet: dev is neither creator nor member of a connected project.
    listed = (await client.get("/api/v1/initiatives")).json()
    assert all(i["id"] != ini_id for i in listed["items"])

    # Connect the shared project (direct row — API mutations are creator-only).
    async with app.state.sessionmaker() as session, session.begin():
        session.add(InitiativeProject(initiative_id=ini_id, project_id=shared_pid))

    listed = (await client.get("/api/v1/initiatives")).json()
    row = next(i for i in listed["items"] if i["id"] == ini_id)
    assert row["is_mine"] is False
    assert row["owner_name"] == "Owner"
    # Leak guard: 2 connections, but only the shared project's rollup is shown.
    assert row["connected_project_count"] == 2
    assert [p["project_name"] for p in row["projects"]] == ["공유 프로젝트"]

    # Creator-only mutations: the dev member gets 404 on edit/connect/delete.
    assert (
        await client.patch(f"/api/v1/initiatives/{ini_id}", json={"name": "탈취"})
    ).status_code == 404
    assert (await connect(client, ini_id, str(shared_pid))).status_code == 404
    assert (await client.delete(f"/api/v1/initiatives/{ini_id}")).status_code == 404


async def test_connect_requires_project_membership(client, foreign_project):
    ini = await create_initiative(client, name="멤버십 검증")
    res = await connect(client, ini["id"], str(foreign_project["project_id"]))
    assert res.status_code == 404  # existence hiding, same as every guard


async def test_delete_cascades_connections_not_projects(client, app):
    p = await create_project(client, key="INID", name="삭제 검증")
    ini = await create_initiative(client, name="삭제 대상")
    assert (await connect(client, ini["id"], p["id"])).status_code == 200

    assert (await client.delete(f"/api/v1/initiatives/{ini['id']}")).status_code == 204
    async with app.state.sessionmaker() as session:
        links = (await session.execute(select(InitiativeProject))).scalars().all()
        assert links == []
        project_alive = (
            await session.execute(select(Project).where(Project.key == "INID"))
        ).scalar_one_or_none()
        assert project_alive is not None
