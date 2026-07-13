import asyncio
import uuid

from app.models import User, WorkspaceSavedView


async def _create(client, name: str = "My view", **params):
    response = await client.post(
        "/api/v1/me/workspace-views",
        json={"name": name, "params": params},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_workspace_saved_view_crud_and_canonical_params(client):
    view = await _create(
        client,
        "  Delivery  ",
        q="  release  ",
        scope="assigned",
        state="open",
        sort="due",
        priority="high",
        layout="timeline",
        density="compact",
    )
    assert view["name"] == "Delivery"
    assert view["params"] == {
        "q": "release",
        "scope": "assigned",
        "state": "open",
        "sort": "due",
        "priority": "high",
        "layout": "timeline",
        "density": "compact",
    }
    assert view["version"] == 0
    listed = await client.get("/api/v1/me/workspace-views")
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    updated = await client.patch(
        f"/api/v1/me/workspace-views/{view['id']}",
        json={
            "expected_version": 0,
            "params": {"scope": "created", "layout": "calendar"},
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == 1
    assert updated.json()["params"]["scope"] == "created"
    assert updated.json()["params"]["layout"] == "calendar"

    stale = await client.delete(f"/api/v1/me/workspace-views/{view['id']}?expected_version=0")
    assert stale.status_code == 409
    assert stale.json()["current"]["version"] == 1
    assert (
        await client.delete(f"/api/v1/me/workspace-views/{view['id']}?expected_version=1")
    ).status_code == 204


async def test_workspace_saved_view_validation_duplicate_and_cap(client, app, dev_user):
    await _create(client, "Weekly")
    duplicate = await client.post(
        "/api/v1/me/workspace-views",
        json={"name": " weekly ", "params": {}},
    )
    assert duplicate.status_code == 409
    for payload in (
        {"name": " ", "params": {}},
        {"name": "bad", "params": {"layout": "grid"}},
        {"name": "bad", "params": {"page": 2}},
    ):
        assert (await client.post("/api/v1/me/workspace-views", json=payload)).status_code == 422

    async with app.state.sessionmaker() as session, session.begin():
        session.add_all(
            [WorkspaceSavedView(user_id=dev_user.id, name=f"seed {index}") for index in range(49)]
        )
    capped = await client.post(
        "/api/v1/me/workspace-views",
        json={"name": "one too many", "params": {}},
    )
    assert capped.status_code == 409
    assert capped.json()["detail"] == "workspace view limit (50) reached"


async def test_workspace_saved_views_are_user_isolated(client, app):
    mine = await _create(client, "Mine")
    foreign_id = uuid.uuid4()
    async with app.state.sessionmaker() as session, session.begin():
        other = User(email="views-other@oneflow.local", display_name="Views Other")
        session.add(other)
        await session.flush()
        session.add(WorkspaceSavedView(id=foreign_id, user_id=other.id, name="Hidden"))

    listed = (await client.get("/api/v1/me/workspace-views")).json()
    assert listed["total"] == 1
    assert listed["items"][0]["id"] == mine["id"]
    assert (
        await client.patch(
            f"/api/v1/me/workspace-views/{foreign_id}",
            json={"expected_version": 0, "name": "Stolen"},
        )
    ).status_code == 404
    assert (
        await client.delete(f"/api/v1/me/workspace-views/{foreign_id}?expected_version=0")
    ).status_code == 404


async def test_workspace_saved_view_concurrent_patch_has_single_winner(client):
    view = await _create(client, "Race")
    first, second = await asyncio.gather(
        client.patch(
            f"/api/v1/me/workspace-views/{view['id']}",
            json={"expected_version": 0, "name": "First"},
        ),
        client.patch(
            f"/api/v1/me/workspace-views/{view['id']}",
            json={"expected_version": 0, "name": "Second"},
        ),
    )
    assert sorted([first.status_code, second.status_code]) == [200, 409]
    winner, loser = (first, second) if first.status_code == 200 else (second, first)
    assert loser.json()["current"]["version"] == 1
    assert loser.json()["current"]["name"] == winner.json()["name"]


async def test_workspace_saved_view_concurrent_create_respects_user_cap(client, app, dev_user):
    async with app.state.sessionmaker() as session, session.begin():
        session.add_all(
            [WorkspaceSavedView(user_id=dev_user.id, name=f"seed {index}") for index in range(49)]
        )

    first, second = await asyncio.gather(
        client.post(
            "/api/v1/me/workspace-views",
            json={"name": "cap first", "params": {}},
        ),
        client.post(
            "/api/v1/me/workspace-views",
            json={"name": "cap second", "params": {}},
        ),
    )
    assert sorted([first.status_code, second.status_code]) == [201, 409]
    listed = await client.get("/api/v1/me/workspace-views")
    assert listed.json()["total"] == 50


async def test_workspace_saved_view_max_version_is_conflict_but_remains_deletable(
    client, app, dev_user
):
    view_id = uuid.uuid4()
    async with app.state.sessionmaker() as session, session.begin():
        session.add(
            WorkspaceSavedView(
                id=view_id,
                user_id=dev_user.id,
                name="Version ceiling",
                version=2_147_483_647,
            )
        )

    updated = await client.patch(
        f"/api/v1/me/workspace-views/{view_id}",
        json={"expected_version": 2_147_483_647, "name": "Overflow"},
    )
    assert updated.status_code == 409
    assert updated.json()["detail"] == "workspace view version limit reached"
    assert updated.json()["current"]["version"] == 2_147_483_647
    assert (
        await client.delete(f"/api/v1/me/workspace-views/{view_id}?expected_version=2147483647")
    ).status_code == 204
