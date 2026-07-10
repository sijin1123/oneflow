"""Work-package list filters (Pass 52 PR-BR — backlog additive filters)."""


async def test_backlog_filters(client, foreign_project):
    """Pass 52 PR-BR (v52.1): no_cycle (cycle_id IS NULL) and open_only
    (closed vocabulary excluded) as independent ANDs inside the member
    scope; contradictory no_cycle+cycle_id is a 422."""
    from tests.conftest import create_project, create_wp

    project = await create_project(client, key="BKLG", name="백로그")
    pid = project["id"]
    cycle = (
        await client.post(
            f"/api/v1/projects/{pid}/cycles",
            json={"name": "스프린트", "start_date": "2026-07-01", "end_date": "2026-07-14"},
        )
    ).json()
    in_cycle = await create_wp(client, pid, subject="사이클 내")
    await client.patch(
        f"/api/v1/work-packages/{in_cycle['id']}",
        json={"expected_version": 0, "cycle_id": cycle["id"]},
    )
    await create_wp(client, pid, subject="백로그 열림")
    closed = await create_wp(client, pid, subject="백로그 종결")
    await client.patch(
        f"/api/v1/work-packages/{closed['id']}", json={"expected_version": 0, "status": "done"}
    )

    base = f"/api/v1/projects/{pid}/work-packages"
    backlog = (await client.get(f"{base}?no_cycle=true&open_only=true")).json()
    assert [w["subject"] for w in backlog["items"]] == ["백로그 열림"]
    no_cycle_only = (await client.get(f"{base}?no_cycle=true")).json()
    assert {w["subject"] for w in no_cycle_only["items"]} == {"백로그 열림", "백로그 종결"}

    # Contradiction is a 422; the member scope is never bypassed.
    assert (await client.get(f"{base}?no_cycle=true&cycle_id={cycle['id']}")).status_code == 422
    foreign = str(foreign_project["project_id"])
    assert (
        await client.get(f"/api/v1/projects/{foreign}/work-packages?no_cycle=true")
    ).status_code == 404
