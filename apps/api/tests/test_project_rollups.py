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
