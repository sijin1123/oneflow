"""Portfolio timeline (Pass 75 PR-CN, v75.1).

Lane spans derive from dated WPs (min of any start/due → max, independent
aggregate); scope/order/paging/total mirror the #138 portfolio contract; the
open count reuses WP_CLOSED_STATUSES; milestones are one batch (dated only).
"""

from tests.conftest import create_project, create_wp


async def test_timeline_spans_open_count_and_milestones(app, client, dev_user):
    project = await create_project(client, key="PT", name="가 포트")
    pid = project["id"]
    # Mixed dating: start-only, due-only, both, undated, and one CLOSED.
    await create_wp(client, pid, subject="시작만", start_date="2026-07-05")
    await create_wp(client, pid, subject="기한만", due_date="2026-07-20")
    await create_wp(client, pid, subject="둘 다", start_date="2026-07-01", due_date="2026-07-10")
    await create_wp(client, pid, subject="미일정")
    done = await create_wp(
        client, pid, subject="완료", start_date="2026-06-01", due_date="2026-06-02"
    )
    res = await client.patch(
        f"/api/v1/work-packages/{done['id']}", json={"expected_version": 0, "status": "done"}
    )
    assert res.status_code == 200
    res = await client.post(
        f"/api/v1/projects/{pid}/milestones", json={"name": "v1", "due_date": "2026-07-15"}
    )
    assert res.status_code == 201
    res = await client.post(f"/api/v1/projects/{pid}/milestones", json={"name": "무일정"})
    assert res.status_code == 201, res.text

    body = (await client.get("/api/v1/reports/portfolio/timeline")).json()
    assert body["total"] == 1
    row = body["items"][0]
    # Span includes the CLOSED wp's dates (history is part of the lane).
    assert (row["start_date"], row["end_date"]) == ("2026-06-01", "2026-07-20")
    assert row["open_work_package_count"] == 4  # done excluded; undated still open (#138 술어)
    assert [(m["name"], m["due_date"]) for m in row["milestones"]] == [("v1", "2026-07-15")]


async def test_timeline_no_dates_scope_and_paging(app, client, dev_user, foreign_project):
    a = await create_project(client, key="TA", name="가")
    await create_wp(client, a["id"], subject="미일정만")
    b = await create_project(client, key="TB", name="나")
    assert (await client.post(f"/api/v1/projects/{b['id']}/archive")).status_code == 200

    body = (await client.get("/api/v1/reports/portfolio/timeline")).json()
    # Foreign project excluded; archived hidden by default; undated → null span.
    assert [i["key"] for i in body["items"]] == ["TA"]
    assert body["items"][0]["start_date"] is None
    assert body["items"][0]["end_date"] is None

    body = (await client.get("/api/v1/reports/portfolio/timeline?include_archived=true")).json()
    assert [i["key"] for i in body["items"]] == ["TA", "TB"]
    assert body["total"] == 2
    # total counts the SCOPED set before paging (v75.1 R1-①).
    body = (
        await client.get(
            "/api/v1/reports/portfolio/timeline?include_archived=true&limit=1&offset=1"
        )
    ).json()
    assert [i["key"] for i in body["items"]] == ["TB"]
    assert body["total"] == 2
    assert (await client.get("/api/v1/reports/portfolio/timeline?limit=0")).status_code == 422
    assert (await client.get("/api/v1/reports/portfolio/timeline?limit=201")).status_code == 422
