"""Workspace General Settings profile API contracts."""

import asyncio

from sqlalchemy import text


async def update_profile(client, name: str, revision: int = 1):
    return await client.patch(
        "/api/v1/admin/workspace/profile",
        json={"name": name},
        headers={"If-Match": f'"{revision}"'},
    )


async def test_workspace_profile_default_read_and_name_update(client):
    default = await client.get("/api/v1/workspace/profile")
    assert default.status_code == 200
    assert default.headers["etag"] == '"1"'
    assert default.json() == {"name": "OneFlow", "revision": 1}

    admin = await client.get("/api/v1/admin/workspace/profile")
    assert admin.status_code == 200
    assert admin.headers["etag"] == '"1"'
    assert admin.json()["id"] == 1
    assert admin.json()["updated_by_user_id"] is None
    assert admin.json()["updated_by_name"] is None

    updated = await update_profile(client, "  Product Operations  ")
    assert updated.status_code == 200, updated.text
    assert updated.headers["etag"] == '"2"'
    assert updated.json()["name"] == "Product Operations"
    assert updated.json()["revision"] == 2
    assert updated.json()["updated_by_user_id"] is not None
    assert updated.json()["updated_by_name"] == "Dev User"
    assert (await client.get("/api/v1/workspace/profile")).json()["name"] == "Product Operations"


async def test_workspace_profile_admin_authz_and_validation(client, app):
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(text("UPDATE users SET is_admin = false"))

    assert (await client.get("/api/v1/workspace/profile")).status_code == 200
    assert (await client.get("/api/v1/admin/workspace/profile")).status_code == 403
    assert (await update_profile(client, "Denied")).status_code == 403

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(text("UPDATE users SET is_admin = true"))

    for name in ("", "   ", "x" * 81):
        response = await update_profile(client, name)
        assert response.status_code == 422
    missing = await client.patch("/api/v1/admin/workspace/profile", json={"name": "Valid"})
    assert missing.status_code == 428
    assert (
        await client.patch(
            "/api/v1/admin/workspace/profile", json={"name": "Valid"}, headers={"If-Match": 'W/"1"'}
        )
    ).status_code == 422


async def test_workspace_profile_stale_and_concurrent_writers(client):
    first, second = await asyncio.gather(
        update_profile(client, "First"), update_profile(client, "Second")
    )
    assert sorted([first.status_code, second.status_code]) == [200, 412]
    stale = first if first.status_code == 412 else second
    assert stale.headers["etag"] == '"2"'
    assert stale.json()["detail"] == {"code": "stale_revision", "current_revision": 2}
    profile = await client.get("/api/v1/workspace/profile")
    assert profile.headers["etag"] == '"2"'
    assert profile.json()["revision"] == 2


async def test_workspace_calendar_normalizes_values_and_shares_revision(client, app):
    default = await client.get("/api/v1/workspace/calendar")
    assert default.status_code == 200
    assert default.headers["etag"] == '"1"'
    assert default.json()["working_weekdays"] == [0, 1, 2, 3, 4]
    assert default.json()["holidays"] == []

    updated = await client.patch(
        "/api/v1/admin/workspace/calendar",
        json={
            "working_weekdays": [5, 0, 1, 2, 3, 4, 5],
            "holidays": ["2026-07-20", "2026-07-20", "2026-12-25"],
        },
        headers={"If-Match": '"1"'},
    )
    assert updated.status_code == 200, updated.text
    assert updated.headers["etag"] == '"2"'
    assert updated.json()["working_weekdays"] == [0, 1, 2, 3, 4, 5]
    assert updated.json()["holidays"] == ["2026-07-20", "2026-12-25"]

    stale = await client.patch(
        "/api/v1/admin/workspace/calendar",
        json={"working_weekdays": [0, 1, 2, 3, 4], "holidays": []},
        headers={"If-Match": '"1"'},
    )
    assert stale.status_code == 412
    assert stale.json()["detail"] == {"code": "stale_revision", "current_revision": 2}

    invalid = await client.patch(
        "/api/v1/admin/workspace/calendar",
        json={"working_weekdays": [], "holidays": []},
        headers={"If-Match": '"2"'},
    )
    assert invalid.status_code == 422
    invalid_weekday = await client.patch(
        "/api/v1/admin/workspace/calendar",
        json={"working_weekdays": [7], "holidays": []},
        headers={"If-Match": '"2"'},
    )
    assert invalid_weekday.status_code == 422
    invalid_holiday = await client.patch(
        "/api/v1/admin/workspace/calendar",
        json={"working_weekdays": [0], "holidays": ["2026-02-30"]},
        headers={"If-Match": '"2"'},
    )
    assert invalid_holiday.status_code == 422

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(text("UPDATE users SET is_admin = false"))
    assert (await client.get("/api/v1/workspace/calendar")).status_code == 200
    denied = await client.patch(
        "/api/v1/admin/workspace/calendar",
        json={"working_weekdays": [0], "holidays": []},
        headers={"If-Match": '"2"'},
    )
    assert denied.status_code == 403
