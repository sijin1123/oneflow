"""Workspace-admin worklog audit API coverage."""

import csv
import io
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, update

from app.api.v1 import admin_worklogs
from app.models import Project, ProjectMember, TimeEntry, User
from tests.conftest import create_project, create_wp

FROM = date(2026, 1, 1)
TO = date(2026, 1, 31)


async def _entry(
    app, wp_id, *, hours=1, spent_on=FROM, user_id=None, comment=None, created_at=None
):
    async with app.state.sessionmaker() as session, session.begin():
        entry = TimeEntry(
            work_package_id=wp_id,
            user_id=user_id,
            hours=Decimal(str(hours)),
            spent_on=spent_on,
            comment=comment,
            created_at=created_at or datetime.now(UTC),
        )
        session.add(entry)
        await session.flush()
        return entry.id


async def test_admin_sees_cross_project_rows_and_filters(app, client, dev_user):
    first = await create_project(client, key="ONE")
    second = await create_project(client, key="TWO")
    first_wp = await create_wp(client, first["id"], subject="first")
    second_wp = await create_wp(client, second["id"], subject="second")
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            delete(ProjectMember).where(
                ProjectMember.project_id == second["id"],
                ProjectMember.user_id == dev_user.id,
            )
        )
    await _entry(app, first_wp["id"], hours=1.25, user_id=dev_user.id)
    await _entry(app, second_wp["id"], hours=2.5, user_id=dev_user.id)

    response = await client.get(f"/api/v1/admin/worklogs?from={FROM}&to={TO}")
    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert response.json()["total_hours"] == 3.75
    assert response.json()["from_date"] == str(FROM)
    assert response.json()["to_date"] == str(TO)
    assert response.json()["limit"] == 50
    assert response.json()["offset"] == 0

    filtered = await client.get(
        f"/api/v1/admin/worklogs?from={FROM}&to={TO}&project_id={first['id']}"
    )
    assert [item["project_id"] for item in filtered.json()["items"]] == [first["id"]]
    by_user = await client.get(f"/api/v1/admin/worklogs?from={FROM}&to={TO}&user_id={dev_user.id}")
    assert by_user.json()["total"] == 2


async def test_worklog_filter_validation_and_non_admin_forbidden(app, client):
    assert (await client.get("/api/v1/admin/worklogs")).status_code == 422
    for suffix in ("from=2026-01-02&to=2026-01-01", "from=2025-01-01&to=2026-01-02"):
        assert (await client.get(f"/api/v1/admin/worklogs?{suffix}")).status_code == 422
    assert (
        await client.get(f"/api/v1/admin/worklogs?from={FROM}&to={TO}&user_id=not-a-user")
    ).status_code == 422
    assert (
        await client.get(f"/api/v1/admin/worklogs?from={FROM}&to={TO}&limit=101")
    ).status_code == 422

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(update(User).values(is_admin=False))
    assert (await client.get(f"/api/v1/admin/worklogs?from={FROM}&to={TO}")).status_code == 403
    assert (await client.get("/api/v1/admin/worklogs/options")).status_code == 403


async def test_inactive_archived_and_deleted_history_and_options(app, client, dev_user):
    project = await create_project(client, key="ARC")
    wp = await create_wp(client, project["id"], subject="=formula subject")
    async with app.state.sessionmaker() as session, session.begin():
        inactive = User(email="inactive@oneflow.local", display_name="Inactive", is_active=False)
        session.add(inactive)
        await session.flush()
        await session.execute(
            update(Project).where(Project.id == project["id"]).values(archived_at=datetime.now(UTC))
        )
        inactive_id = inactive.id
    await _entry(app, wp["id"], user_id=inactive_id)
    await _entry(app, wp["id"], user_id=None, comment="=danger")

    response = await client.get(f"/api/v1/admin/worklogs?from={FROM}&to={TO}")
    rows = response.json()["items"]
    assert {row["user_id"] for row in rows} == {str(inactive_id), None}
    assert any(row["user_is_active"] is False for row in rows)
    assert any(row["project_is_archived"] is True for row in rows)
    deleted = await client.get(f"/api/v1/admin/worklogs?from={FROM}&to={TO}&user_id=deleted")
    assert deleted.json()["total"] == 1

    options = (await client.get("/api/v1/admin/worklogs/options")).json()
    assert any(
        user["id"] == str(inactive_id)
        and user["email"] == "inactive@oneflow.local"
        and not user["is_active"]
        for user in options["users"]
    )
    assert any(item["id"] == project["id"] and item["is_archived"] for item in options["projects"])


async def test_totals_empty_page_and_stable_order(app, client, dev_user):
    project = await create_project(client, key="ORD")
    wp = await create_wp(client, project["id"])
    stamp = datetime(2026, 1, 2, tzinfo=UTC)
    first = await _entry(app, wp["id"], hours=1, user_id=dev_user.id, created_at=stamp)
    second = await _entry(app, wp["id"], hours=2, user_id=dev_user.id, created_at=stamp)
    await _entry(
        app,
        wp["id"],
        hours=3,
        user_id=dev_user.id,
        spent_on=FROM + timedelta(days=1),
        created_at=stamp,
    )
    page = (await client.get(f"/api/v1/admin/worklogs?from={FROM}&to={TO}&limit=2")).json()
    assert page["total"] == 3 and page["total_hours"] == 6
    assert page["items"][0]["spent_on"] == "2026-01-02"
    same_day = (await client.get(f"/api/v1/admin/worklogs?from={FROM}&to={TO}&limit=100")).json()[
        "items"
    ]
    positions = [row["id"] for row in same_day if row["id"] in {str(first), str(second)}]
    assert positions == sorted(positions, reverse=True)
    empty = (await client.get(f"/api/v1/admin/worklogs?from={FROM}&to={TO}&offset=100")).json()
    assert empty == {
        "from_date": str(FROM),
        "to_date": str(TO),
        "items": [],
        "total": 3,
        "total_hours": 6.0,
        "limit": 50,
        "offset": 100,
    }


async def test_csv_matches_list_guards_text_and_enforces_cap(app, client, dev_user, monkeypatch):
    project = await create_project(client, key="CSV", name="=project")
    wp = await create_wp(client, project["id"], subject="=subject")
    await _entry(app, wp["id"], user_id=dev_user.id, comment="@formula")
    listing = (await client.get(f"/api/v1/admin/worklogs?from={FROM}&to={TO}")).json()
    exported = await client.get(f"/api/v1/admin/worklogs/export.csv?from={FROM}&to={TO}")
    assert exported.status_code == 200
    assert exported.text.startswith("\ufeff")
    assert "2026-01-01-to-2026-01-31" in exported.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(exported.text.removeprefix("\ufeff"))))
    assert len(rows) == listing["total"] == 1
    assert rows[0]["project_name"] == "'=project"
    assert rows[0]["work_package_subject"] == "'=subject"
    assert rows[0]["comment"] == "'@formula"

    await _entry(app, wp["id"], user_id=dev_user.id)
    monkeypatch.setattr(admin_worklogs, "CSV_ROW_CAP", 1)
    capped = await client.get(f"/api/v1/admin/worklogs/export.csv?from={FROM}&to={TO}")
    assert capped.status_code == 422
