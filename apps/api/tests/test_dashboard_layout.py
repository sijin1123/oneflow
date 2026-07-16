"""Personal and project-shared dashboard widget layouts.

Effective resolution is personal > shared > built-in. Personal writes remain
viewer/archive-exempt preferences; shared writes are active-project owner-only
and versioned."""

import pytest
from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError

from app.models import ProjectMember
from app.models.dashboard_layout import WIDGET_KEYS, DashboardSharedLayout
from tests.conftest import create_project


async def get_layout(client, pid):
    return (await client.get(f"/api/v1/projects/{pid}/dashboard/layout")).json()


async def put_layout(client, pid, widgets):
    return await client.put(f"/api/v1/projects/{pid}/dashboard/layout", json={"widgets": widgets})


async def put_shared(client, pid, widgets, expected_version=0):
    return await client.put(
        f"/api/v1/projects/{pid}/dashboard/shared-layout",
        json={"widgets": widgets, "expected_version": expected_version},
    )


@pytest.fixture
async def project(client):
    return await create_project(client, key="WIDG", name="위젯 프로젝트")


async def test_default_then_roundtrip_normalized(client, project):
    pid = project["id"]
    body = await get_layout(client, pid)
    assert body == {
        "widgets": list(WIDGET_KEYS),
        "updated_at": None,
        "is_default": True,
        "source": "builtin",
        "shared_layout": None,
        "can_manage_shared": True,
    }

    # PUT normalizes duplicates keeping the first occurrence, preserves order.
    res = await put_layout(client, pid, ["progress", "summary", "progress"])
    assert res.status_code == 200, res.text
    assert res.json()["widgets"] == ["progress", "summary"]
    assert res.json()["is_default"] is False
    assert res.json()["source"] == "personal"

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
    # Project-owned configuration stays blocked while archived.
    assert (await put_shared(client, pid, ["budget"])).status_code == 409
    await client.post(f"/api/v1/projects/{pid}/unarchive")

    foreign_pid = str(foreign_project["project_id"])
    res = await client.get(f"/api/v1/projects/{foreign_pid}/dashboard/layout")
    assert res.status_code == 404  # existence hiding
    assert (await put_layout(client, foreign_pid, ["summary"])).status_code == 404
    assert (await put_shared(client, foreign_pid, ["summary"])).status_code == 404


async def test_type_distribution_widget_key(client, project):
    """Pass 58 PR-BX: the vocabulary grows additively — the new key saves,
    the absent-row default now lists seven, and the old keys keep working."""
    pid = project["id"]
    body = await get_layout(client, pid)
    assert "type_distribution" in body["widgets"]  # default = all seven

    res = await put_layout(client, pid, ["type_distribution", "summary"])
    assert res.status_code == 200, res.text
    assert res.json()["widgets"] == ["type_distribution", "summary"]


async def test_shared_inheritance_personal_override_and_reset(client, project):
    pid = project["id"]
    published = await put_shared(client, pid, ["progress", "summary"])
    assert published.status_code == 200, published.text
    body = published.json()
    assert body["source"] == "shared"
    assert body["widgets"] == ["progress", "summary"]
    assert body["shared_layout"]["version"] == 1
    assert body["shared_layout"]["updated_by_name"] == "Dev User"

    personal = await put_layout(client, pid, ["budget"])
    assert personal.status_code == 200
    assert personal.json()["source"] == "personal"
    assert personal.json()["widgets"] == ["budget"]
    assert personal.json()["shared_layout"]["widgets"] == ["progress", "summary"]

    reset = await client.delete(f"/api/v1/projects/{pid}/dashboard/layout")
    assert reset.status_code == 200
    assert reset.json()["source"] == "shared"
    assert reset.json()["widgets"] == ["progress", "summary"]
    # Reset is idempotent.
    assert (await client.delete(f"/api/v1/projects/{pid}/dashboard/layout")).status_code == 200


async def test_shared_update_delete_and_stale_versions(client, project):
    pid = project["id"]
    created = await put_shared(client, pid, ["summary"])
    assert created.status_code == 200
    assert created.json()["shared_layout"]["version"] == 1

    stale = await put_shared(client, pid, ["budget"], expected_version=0)
    assert stale.status_code == 409
    assert (await get_layout(client, pid))["widgets"] == ["summary"]

    updated = await put_shared(client, pid, ["budget", "budget"], expected_version=1)
    assert updated.status_code == 200
    assert updated.json()["widgets"] == ["budget"]
    assert updated.json()["shared_layout"]["version"] == 2

    # An exact no-op preserves the revision.
    no_op = await put_shared(client, pid, ["budget"], expected_version=2)
    assert no_op.status_code == 200
    assert no_op.json()["shared_layout"]["version"] == 2

    assert (
        await client.delete(f"/api/v1/projects/{pid}/dashboard/shared-layout?expected_version=1")
    ).status_code == 409
    deleted = await client.delete(
        f"/api/v1/projects/{pid}/dashboard/shared-layout?expected_version=2"
    )
    assert deleted.status_code == 200
    assert deleted.json()["source"] == "builtin"
    assert deleted.json()["shared_layout"] is None
    assert (
        await client.delete(f"/api/v1/projects/{pid}/dashboard/shared-layout?expected_version=2")
    ).status_code == 404


async def test_member_and_viewer_inherit_but_cannot_publish(client, app, member_project):
    pid = member_project["project_id"]
    async with app.state.sessionmaker() as session, session.begin():
        session.add(
            DashboardSharedLayout(
                project_id=pid,
                widgets=["progress"],
                version=1,
                updated_by_user_id=member_project["owner_id"],
                updated_by_name="Owner",
            )
        )

    body = await get_layout(client, pid)
    assert body["source"] == "shared"
    assert body["widgets"] == ["progress"]
    assert body["can_manage_shared"] is False
    assert (await put_shared(client, pid, ["summary"])).status_code == 403
    assert (
        await client.delete(f"/api/v1/projects/{pid}/dashboard/shared-layout?expected_version=1")
    ).status_code == 403

    # A regular member may still create/reset a private preference.
    assert (await put_layout(client, pid, ["budget"])).json()["source"] == "personal"
    reset = await client.delete(f"/api/v1/projects/{pid}/dashboard/layout")
    assert reset.json()["source"] == "shared"

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            update(ProjectMember)
            .where(
                ProjectMember.project_id == pid,
                ProjectMember.user_id == member_project["dev_id"],
            )
            .values(role="viewer")
        )
    assert (await put_layout(client, pid, ["summary"])).status_code == 200
    assert (await client.delete(f"/api/v1/projects/{pid}/dashboard/layout")).status_code == 200
    assert (await put_shared(client, pid, ["summary"], expected_version=1)).status_code == 403


async def test_shared_validation_and_db_backstop(client, app, project):
    pid = project["id"]
    assert (await put_shared(client, pid, [])).status_code == 422
    assert (await put_shared(client, pid, ["nope"])).status_code == 422
    me = (await client.get("/api/v1/me")).json()
    with pytest.raises(IntegrityError):
        async with app.state.sessionmaker() as session, session.begin():
            session.add(
                DashboardSharedLayout(
                    project_id=pid,
                    widgets=[],
                    version=0,
                    updated_by_user_id=me["id"],
                    updated_by_name=me["display_name"],
                )
            )


async def test_shared_updater_snapshot_survives_user_deletion(client, app, project):
    pid = project["id"]
    assert (await put_shared(client, pid, ["summary"])).status_code == 200
    me = (await client.get("/api/v1/me")).json()
    async with app.state.sessionmaker() as session, session.begin():
        stmt = text("DELETE FROM users WHERE id = CAST(:uid AS uuid)").bindparams(uid=me["id"])
        await session.execute(stmt)
    async with app.state.sessionmaker() as session:
        shared = await session.scalar(
            select(DashboardSharedLayout).where(DashboardSharedLayout.project_id == pid)
        )
        assert shared is not None
        assert shared.updated_by_user_id is None
        assert shared.updated_by_name == me["display_name"]
