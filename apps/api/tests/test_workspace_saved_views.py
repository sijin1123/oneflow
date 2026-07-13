import asyncio
import uuid

from sqlalchemy import select

from app.models import ProjectMember, User, WorkspaceSavedView
from tests.conftest import create_project


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
        group_by="assignee",
        columns=["due", "project", "assignee", "status"],
        show_empty_groups=False,
        show_ids=True,
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
        "group_by": "assignee",
        "columns": ["project", "status", "assignee", "due"],
        "show_empty_groups": False,
        "show_ids": True,
        "filter_mode": "basic",
        "pql": "",
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


async def test_workspace_saved_view_pql_mode_canonicalizes_and_rejects_invalid_values(client):
    view = await _create(
        client,
        "PQL",
        filter_mode="pql",
        pql="state = OPEN order by updated desc limit 4",
        state="open",
        sort="due",
        priority="urgent",
        group_by="priority",
        columns=["status", "priority", "updated"],
        show_empty_groups=False,
        show_ids=True,
    )
    assert view["params"]["filter_mode"] == "pql"
    assert view["params"]["pql"] == "state = open ORDER BY updated DESC LIMIT 4"
    assert view["params"]["state"] == "all"
    assert view["params"]["sort"] == "updated"
    assert view["params"]["priority"] == "all"
    assert view["params"]["group_by"] == "priority"
    assert view["params"]["columns"] == ["status", "priority", "updated"]
    assert view["params"]["show_empty_groups"] is False
    assert view["params"]["show_ids"] is True
    for params in (
        {"filter_mode": "pql", "pql": " "},
        {"filter_mode": "pql", "pql": "priority = impossible"},
        {"filter_mode": "basic", "pql": "state = open"},
    ):
        response = await client.post(
            "/api/v1/me/workspace-views", json={"name": "invalid", "params": params}
        )
        if params["filter_mode"] == "basic":
            assert response.status_code == 201
            assert response.json()["params"]["pql"] == ""
        else:
            assert response.status_code == 422


async def test_workspace_saved_view_rejects_invalid_display_params(client):
    for params in (
        {"columns": []},
        {"columns": ["project", "project"]},
        {"columns": ["project", "unknown"]},
        {"group_by": "unknown"},
    ):
        response = await client.post(
            "/api/v1/me/workspace-views", json={"name": "invalid display", "params": params}
        )
        assert response.status_code == 422


async def test_workspace_saved_view_display_defaults(client):
    view = await _create(client, "Display defaults")
    assert view["params"]["group_by"] == "state"
    assert view["params"]["columns"] == [
        "project",
        "status",
        "priority",
        "type",
        "assignee",
        "start",
        "due",
        "updated",
    ]
    assert view["params"]["show_empty_groups"] is True
    assert view["params"]["show_ids"] is False


async def test_workspace_saved_view_pql_values_stay_inside_visible_membership(client, app):
    visible = await create_project(client, key="VISIBLE", name="Visible")
    stored = await _create(
        client,
        "Visible PQL",
        filter_mode="pql",
        pql="project = visible",
    )
    assert stored["params"]["pql"] == "project = visible"

    async with app.state.sessionmaker() as session, session.begin():
        other = User(email="pql-hidden@example.com", display_name="Hidden Assignee")
        session.add(other)
        await session.flush()
        session.add(ProjectMember(project_id=uuid.UUID(visible["id"]), user_id=other.id))

    assert (
        await client.post(
            "/api/v1/me/workspace-views",
            json={
                "name": "Visible assignee",
                "params": {"filter_mode": "pql", "pql": "assignee = 'Hidden Assignee'"},
            },
        )
    ).status_code == 201
    async with app.state.sessionmaker() as session, session.begin():
        session.add(User(email="pql-private@example.com", display_name="Private Assignee"))
    private_assignee = await client.post(
        "/api/v1/me/workspace-views",
        json={
            "name": "Private assignee",
            "params": {"filter_mode": "pql", "pql": "assignee = 'Private Assignee'"},
        },
    )
    assert private_assignee.status_code == 422
    hidden_project = await create_project(
        client,
        key="HIDDEN",
        name="Hidden",
    )
    me_id = uuid.UUID((await client.get("/api/v1/me")).json()["id"])
    async with app.state.sessionmaker() as session, session.begin():
        membership = (
            await session.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == uuid.UUID(hidden_project["id"]),
                    ProjectMember.user_id == me_id,
                )
            )
        ).scalar_one()
        await session.delete(membership)
    rejected = await client.post(
        "/api/v1/me/workspace-views",
        json={
            "name": "Hidden PQL",
            "params": {"filter_mode": "pql", "pql": "project = hidden"},
        },
    )
    assert rejected.status_code == 422


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
