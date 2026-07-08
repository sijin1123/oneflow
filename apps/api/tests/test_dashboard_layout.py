"""Per-user dashboard widget layout (expansion PLAN Pass 18 PR-AJ).

Contract (v18.1): absent row = default (all six, is_default); PUT normalizes
(de-dup, first occurrence) and is deliberately last-write-wins; DB CHECK holds
vocabulary + non-empty; the layout is a PERSONAL preference — per-user isolated,
archive-exempt, preserved across membership changes."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models.dashboard_layout import WIDGET_KEYS
from tests.conftest import create_project


async def get_layout(client, pid):
    return (await client.get(f"/api/v1/projects/{pid}/dashboard/layout")).json()


async def put_layout(client, pid, widgets):
    return await client.put(f"/api/v1/projects/{pid}/dashboard/layout", json={"widgets": widgets})


@pytest.fixture
async def project(client):
    return await create_project(client, key="WIDG", name="위젯 프로젝트")


async def test_default_then_roundtrip_normalized(client, project):
    pid = project["id"]
    body = await get_layout(client, pid)
    assert body == {"widgets": list(WIDGET_KEYS), "updated_at": None, "is_default": True}

    # PUT normalizes duplicates keeping the first occurrence, preserves order.
    res = await put_layout(client, pid, ["progress", "summary", "progress"])
    assert res.status_code == 200, res.text
    assert res.json()["widgets"] == ["progress", "summary"]
    assert res.json()["is_default"] is False

    body = await get_layout(client, pid)
    assert body["widgets"] == ["progress", "summary"]
    assert body["is_default"] is False
    assert body["updated_at"] is not None

    # Upsert: a second PUT replaces (last-write-wins by design — R1-①).
    assert (await put_layout(client, pid, ["recent_activity"])).status_code == 200
    assert (await get_layout(client, pid))["widgets"] == ["recent_activity"]


async def test_validation_and_db_backstop(client, app, project):
    pid = project["id"]
    assert (await put_layout(client, pid, [])).status_code == 422
    assert (await put_layout(client, pid, ["nope"])).status_code == 422

    # DB CHECK blocks API-bypassing garbage (vocabulary + non-empty).
    me = (await client.get("/api/v1/me")).json()["id"]
    with pytest.raises(IntegrityError):
        async with app.state.sessionmaker() as session, session.begin():
            await session.execute(
                text(
                    "INSERT INTO dashboard_layouts (project_id, user_id, widgets) "
                    "VALUES (CAST(:pid AS uuid), CAST(:uid AS uuid), '[]'::jsonb)"
                ).bindparams(pid=pid, uid=me)
            )


async def test_per_user_isolation(client, app, member_project):
    """The dev user's layout in a shared project never affects the owner's."""
    pid = str(member_project["project_id"])
    assert (await put_layout(client, pid, ["budget"])).status_code == 200

    async with app.state.sessionmaker() as session:
        rows = (await session.execute(text("SELECT user_id FROM dashboard_layouts"))).scalars()
        assert {str(u) for u in rows} == {str(member_project["dev_id"])}


async def test_archive_exempt_and_guards(client, project, foreign_project):
    pid = project["id"]
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    # Personal display preference: PUT allowed while archived (R1-③ exemption).
    assert (await put_layout(client, pid, ["summary"])).status_code == 200
    assert (await get_layout(client, pid))["widgets"] == ["summary"]
    await client.post(f"/api/v1/projects/{pid}/unarchive")

    foreign_pid = str(foreign_project["project_id"])
    res = await client.get(f"/api/v1/projects/{foreign_pid}/dashboard/layout")
    assert res.status_code == 404  # existence hiding
    assert (await put_layout(client, foreign_pid, ["summary"])).status_code == 404


async def test_type_distribution_widget_key(client, project):
    """Pass 58 PR-BX: the vocabulary grows additively — the new key saves,
    the absent-row default now lists seven, and the old keys keep working."""
    pid = project["id"]
    body = await get_layout(client, pid)
    assert "type_distribution" in body["widgets"]  # default = all seven

    res = await put_layout(client, pid, ["type_distribution", "summary"])
    assert res.status_code == 200, res.text
    assert res.json()["widgets"] == ["type_distribution", "summary"]
