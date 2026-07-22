"""Project list rollup columns (expansion PLAN Pass 22 PR-AN).

Contract (v22.1): single COUNT FILTER aggregate scoped to the returned ids;
overdue = due_date < UTC-today (bound from the API layer) AND open (fixed
closed vocabulary); member_count = current project_members rows, any role;
archived projects keep their values (read-open)."""

from datetime import UTC, datetime, timedelta

from tests.conftest import create_project, create_wp


def _day(offset: int) -> str:
    return (datetime.now(UTC).date() + timedelta(days=offset)).isoformat()


async def test_rollups_counts(client):
    project = await create_project(client, key="ROLL", name="롤업 프로젝트")
    pid = project["id"]
    await create_wp(client, pid, subject="열림", due_date=_day(1))
    await create_wp(client, pid, subject="기한 초과", due_date=_day(-1))
    done = await create_wp(client, pid, subject="완료됨", due_date=_day(-2))
    await client.patch(
        f"/api/v1/work-packages/{done['id']}", json={"expected_version": 0, "status": "done"}
    )

    items = (await client.get("/api/v1/projects")).json()["items"]
    row = next(p for p in items if p["id"] == pid)
    assert row["work_package_count"] == 3
    assert row["open_work_package_count"] == 2
    # done + past-due does NOT count as overdue (closed vocabulary excluded).
    assert row["overdue_count"] == 1
    assert row["member_count"] == 1  # the creating owner
    assert row["current_user_role"] == "owner"


async def test_list_exposes_current_member_role(client, member_project):
    items = (await client.get("/api/v1/projects")).json()["items"]
    row = next(p for p in items if p["id"] == str(member_project["project_id"]))
    assert row["current_user_role"] == "member"


async def test_rollups_empty_and_archived(client):
    project = await create_project(client, key="ROLL2", name="빈 프로젝트")
    pid = project["id"]
    items = (await client.get("/api/v1/projects")).json()["items"]
    row = next(p for p in items if p["id"] == pid)
    assert (
        row["work_package_count"],
        row["open_work_package_count"],
        row["overdue_count"],
        row["member_count"],
    ) == (0, 0, 0, 1)

    # Archived projects keep serving rollups when included (read-open).
    await create_wp(client, pid, subject="보관 전 작업")
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    items = (await client.get("/api/v1/projects?include_archived=true")).json()["items"]
    row = next(p for p in items if p["id"] == pid)
    assert row["work_package_count"] == 1
    await client.post(f"/api/v1/projects/{pid}/unarchive")


async def test_initiative_rollup_column(client, app):
    """Pass 51 PR-BQ (v51.1): a separate aggregate — top 5 by name + overflow
    count; unconnected projects get an empty list; no cross-project
    contamination (connection implies visibility)."""

    from tests.conftest import create_project

    a = await create_project(client, key="INIA", name="이니셔티브 A")
    b = await create_project(client, key="INIB", name="이니셔티브 B")

    # Six initiatives connected to A (one overflows the cap of 5); B stays bare.
    for i in range(6):
        ini = (await client.post("/api/v1/initiatives", json={"name": f"전략 {i}"})).json()
        res = await client.post(
            f"/api/v1/initiatives/{ini['id']}/projects", json={"project_id": a["id"]}
        )
        assert res.status_code == 200, res.text

    listed = (await client.get("/api/v1/projects")).json()
    row_a = next(p for p in listed["items"] if p["id"] == a["id"])
    row_b = next(p for p in listed["items"] if p["id"] == b["id"])
    assert [x["name"] for x in row_a["initiatives"]] == [f"전략 {i}" for i in range(5)]
    assert row_a["initiative_overflow"] == 1
    assert (row_b["initiatives"], row_b["initiative_overflow"]) == ([], 0)

    # A foreign creator's initiative connected to MY project still shows
    # (connection implies visibility); one connected only to a foreign
    # project never bleeds in.
    async with app.state.sessionmaker() as session, session.begin():
        from app.models import Initiative, InitiativeProject, Project, ProjectMember, User

        stranger = User(email="ini-stranger@x.co", display_name="외부인")
        foreign_project = Project(key="INIZ", name="남의 프로젝트")
        session.add_all([stranger, foreign_project])
        await session.flush()
        session.add(ProjectMember(project_id=foreign_project.id, user_id=stranger.id, role="owner"))
        theirs_on_mine = Initiative(name="가나 전략", owner_id=stranger.id)
        theirs_elsewhere = Initiative(name="남의 전략", owner_id=stranger.id)
        session.add_all([theirs_on_mine, theirs_elsewhere])
        await session.flush()
        session.add_all(
            [
                InitiativeProject(initiative_id=theirs_on_mine.id, project_id=b["id"]),
                InitiativeProject(initiative_id=theirs_elsewhere.id, project_id=foreign_project.id),
            ]
        )

    listed = (await client.get("/api/v1/projects")).json()
    row_b = next(p for p in listed["items"] if p["id"] == b["id"])
    assert [x["name"] for x in row_b["initiatives"]] == ["가나 전략"]
    all_names = {x["name"] for p in listed["items"] for x in p["initiatives"]}
    assert "남의 전략" not in all_names  # never bleeds from a foreign project


async def test_directory_search_sort_summary_and_paging(client):
    alpha = await create_project(client, key="ALPHA", name="Alpha 100% Plan")
    beta = await create_project(client, key="BETA", name="Beta Project")
    gamma = await create_project(client, key="GAMMA", name="Gamma Project")

    await create_wp(client, alpha["id"], subject="Alpha open")
    for index in range(3):
        await create_wp(client, beta["id"], subject=f"Beta open {index}")
    assert (await client.post(f"/api/v1/projects/{gamma['id']}/archive")).status_code == 200

    first = (
        await client.get(
            "/api/v1/projects",
            params={
                "include_archived": "true",
                "sort_key": "work_package_count",
                "sort_direction": "desc",
                "limit": 2,
            },
        )
    ).json()
    assert [item["id"] for item in first["items"]] == [beta["id"], alpha["id"]]
    assert first["total"] == 3
    assert first["summary"] == {
        "projects": 3,
        "active": 2,
        "archived": 1,
        "open_work_packages": 4,
        "overdue_work_packages": 0,
        "initiatives": 0,
    }

    second = (
        await client.get(
            "/api/v1/projects",
            params={
                "include_archived": "true",
                "sort_key": "work_package_count",
                "sort_direction": "desc",
                "limit": 2,
                "offset": 2,
            },
        )
    ).json()
    assert [item["id"] for item in second["items"]] == [gamma["id"]]
    assert second["summary"] == first["summary"]

    searched = (
        await client.get(
            "/api/v1/projects",
            params={"include_archived": "true", "q": "Beta"},
        )
    ).json()
    assert [item["id"] for item in searched["items"]] == [beta["id"]]
    assert searched["total"] == 1
    assert searched["summary"]["projects"] == 3

    literal = (await client.get("/api/v1/projects", params={"q": "%"})).json()
    assert [item["id"] for item in literal["items"]] == [alpha["id"]]


async def test_directory_rejects_unknown_sort_contract(client):
    response = await client.get("/api/v1/projects", params={"sort_key": "owner"})
    assert response.status_code == 422
