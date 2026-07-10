"""Portfolio report (Pass 63 PR-CC, v63.1).

Contracts under test: member scope (viewer included, non-member projects
absent), independent per-source aggregates (no join multiplication — R1-①),
totals = server sum of the returned rows (R1-②), include_archived server
param (R1-⑤), limit/offset + full total (R1-③), CSV shares the query and the
serialization (R1-④/⑥) with BOM/formula-guard/headers.
"""

import datetime as dt

from sqlalchemy import text

from app.models import (
    CostEntry,
    Project,
    ProjectMember,
    TimeEntry,
    User,
    WorkPackage,
)
from tests.conftest import create_project


async def _seed(app, client, dev_user):
    """Two member projects (one with rich data, one archived) + one foreign
    project that must never appear. The rich project has MULTIPLE members,
    WPs, cost and time rows at once — the R1-① multiplication fixture."""
    rich = await create_project(client, key="RP", name="가 리치")
    arch = await create_project(client, key="AR", name="나 아카이브")
    async with app.state.sessionmaker() as session, session.begin():
        mate = User(email="mate@oneflow.local", display_name="Mate")
        stranger = User(email="stranger@oneflow.local", display_name="Stranger")
        foreign = Project(key="FR", name="다 남의것", budget=999)
        session.add_all([mate, stranger, foreign])
        await session.flush()
        session.add_all(
            [
                ProjectMember(project_id=rich["id"], user_id=mate.id, role="viewer"),
                ProjectMember(project_id=foreign.id, user_id=stranger.id, role="owner"),
            ]
        )
        # 3 WPs: open+overdue / open / done — plus 2 cost rows and 3 time rows
        # spread over two WPs (join fan-out would inflate counts and sums).
        w1 = WorkPackage(project_id=rich["id"], subject="지연", due_date=dt.date(2020, 1, 1))
        w2 = WorkPackage(project_id=rich["id"], subject="진행")
        w3 = WorkPackage(project_id=rich["id"], subject="완료", status="done")
        session.add_all([w1, w2, w3])
        await session.flush()
        session.add_all(
            [
                CostEntry(
                    work_package_id=w1.id,
                    user_id=dev_user.id,
                    amount=100,
                    spent_on=dt.date(2026, 7, 1),
                ),
                CostEntry(
                    work_package_id=w2.id,
                    user_id=dev_user.id,
                    amount=250,
                    spent_on=dt.date(2026, 7, 2),
                ),
                TimeEntry(
                    work_package_id=w1.id,
                    user_id=dev_user.id,
                    hours=2,
                    spent_on=dt.date(2026, 7, 1),
                ),
                TimeEntry(
                    work_package_id=w1.id,
                    user_id=dev_user.id,
                    hours=3,
                    spent_on=dt.date(2026, 7, 2),
                ),
                TimeEntry(
                    work_package_id=w2.id,
                    user_id=dev_user.id,
                    hours=1.5,
                    spent_on=dt.date(2026, 7, 3),
                ),
            ]
        )
        # A budget on the rich project; the archived one keeps budget NULL.
        await session.execute(
            text("UPDATE projects SET budget = 1000 WHERE id = CAST(:pid AS uuid)").bindparams(
                pid=rich["id"]
            )
        )
    assert (await client.post(f"/api/v1/projects/{arch['id']}/archive")).status_code == 200
    return rich, arch


async def test_portfolio_scope_aggregates_and_totals(app, client, dev_user):
    rich, arch = await _seed(app, client, dev_user)
    res = await client.get("/api/v1/reports/portfolio")
    assert res.status_code == 200, res.text
    body = res.json()
    # Archived hidden by default; the foreign project never appears.
    assert [i["key"] for i in body["items"]] == ["RP"]
    row = body["items"][0]
    # R1-①: exact counts/sums despite multiple members×WPs×cost×time rows.
    assert row["member_count"] == 2
    assert row["work_package_count"] == 3
    assert row["open_work_package_count"] == 2
    assert row["overdue_count"] == 1
    assert row["budget"] == 1000
    assert row["cost_total"] == 350.0
    assert row["hours_total"] == 6.5
    # R1-②: totals equal the sum of the returned rows.
    t = body["totals"]
    assert (t["projects"], t["work_packages"], t["open"], t["overdue"]) == (1, 3, 2, 1)
    assert (t["budget"], t["cost_total"], t["hours_total"]) == (1000, 350.0, 6.5)
    assert body["total"] == 1


async def test_portfolio_include_archived_and_null_budget(app, client, dev_user):
    rich, arch = await _seed(app, client, dev_user)
    res = await client.get("/api/v1/reports/portfolio?include_archived=true")
    body = res.json()
    # Name-sorted: 가 리치, 나 아카이브.
    assert [(i["key"], i["archived"]) for i in body["items"]] == [
        ("RP", False),
        ("AR", True),
    ]
    # NULL budget excluded from the totals sum, not coerced to 0 in the row.
    assert body["items"][1]["budget"] is None
    assert body["totals"]["budget"] == 1000
    assert body["totals"]["projects"] == 2
    assert body["total"] == 2


async def test_portfolio_pagination_and_empty(client, dev_user):
    res = await client.get("/api/v1/reports/portfolio")
    assert res.json() == {
        "items": [],
        "totals": {
            "projects": 0,
            "work_packages": 0,
            "open": 0,
            "overdue": 0,
            "budget": 0,
            "cost_total": 0,
            "hours_total": 0,
        },
        "total": 0,
    }
    for key, name in (("PA", "가"), ("PB", "나"), ("PC", "다")):
        await create_project(client, key=key, name=name)
    res = await client.get("/api/v1/reports/portfolio?limit=2&offset=2")
    body = res.json()
    assert [i["key"] for i in body["items"]] == ["PC"]
    assert body["total"] == 3  # full count regardless of the page
    assert body["totals"]["projects"] == 1  # totals cover the returned rows
    assert (await client.get("/api/v1/reports/portfolio?limit=0")).status_code == 422
    assert (await client.get("/api/v1/reports/portfolio?limit=201")).status_code == 422


async def test_portfolio_viewer_membership_included(app, client, dev_user):
    """A project where the caller is only a VIEWER still appears (read surface)."""
    async with app.state.sessionmaker() as session, session.begin():
        owner = User(email="owner@oneflow.local", display_name="Owner")
        project = Project(key="VW", name="뷰어로 속한")
        session.add_all([owner, project])
        await session.flush()
        session.add_all(
            [
                ProjectMember(project_id=project.id, user_id=owner.id, role="owner"),
                ProjectMember(project_id=project.id, user_id=dev_user.id, role="viewer"),
            ]
        )
    res = await client.get("/api/v1/reports/portfolio")
    assert [i["key"] for i in res.json()["items"]] == ["VW"]


async def test_portfolio_csv_matches_json_and_headers(app, client, dev_user):
    rich, arch = await _seed(app, client, dev_user)
    res = await client.get("/api/v1/reports/portfolio/export.csv?include_archived=true")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "charset=utf-8" in res.headers["content-type"]
    assert res.headers["content-disposition"] == 'attachment; filename="portfolio.csv"'
    body = res.text
    assert body.startswith("﻿")  # BOM
    lines = body.lstrip("﻿").splitlines()
    assert lines[0].split(",")[:4] == ["key", "name", "archived", "health"]
    # Same numbers as the JSON endpoint (shared query function).
    json_body = (await client.get("/api/v1/reports/portfolio?include_archived=true")).json()
    rp = lines[1].split(",")
    assert rp[0] == "RP"
    assert float(rp[9]) == json_body["items"][0]["cost_total"]
    assert float(rp[10]) == json_body["items"][0]["hours_total"]
    assert lines[-1].startswith("TOTAL")
    assert float(lines[-1].split(",")[9]) == json_body["totals"]["cost_total"]


async def test_portfolio_csv_formula_guard(app, client, dev_user):
    await create_project(client, key="EVIL", name="=SUM(A1:A9)")
    res = await client.get("/api/v1/reports/portfolio/export.csv")
    # The dangerous leading character is neutralized in the name column.
    assert "'=SUM(A1:A9)" in res.text
