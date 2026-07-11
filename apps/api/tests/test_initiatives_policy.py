"""Workspace Initiatives policy and cross-surface enforcement."""

import asyncio

from sqlalchemy import func, select

from app.models.initiative import Initiative, InitiativeProject
from tests.conftest import create_project, create_wp


async def set_initiatives(client, enabled: bool, revision: int = 1):
    return await client.patch(
        "/api/v1/admin/workspace/features/initiatives",
        json={"enabled": enabled},
        headers={"If-Match": f'"{revision}"'},
    )


async def test_initiatives_policy_admin_contract_and_cas(client):
    policy = await client.get("/api/v1/admin/workspace/features/initiatives")
    assert policy.status_code == 200
    assert policy.headers["etag"] == '"1"'
    assert policy.json()["feature_key"] == "initiatives"
    assert policy.json()["enabled"] is True

    assert (
        await client.patch("/api/v1/admin/workspace/features/initiatives", json={"enabled": False})
    ).status_code == 428
    assert (
        await client.patch(
            "/api/v1/admin/workspace/features/initiatives",
            json={"enabled": False},
            headers={"If-Match": "1"},
        )
    ).status_code == 422

    first, second = await asyncio.gather(
        set_initiatives(client, False),
        set_initiatives(client, False),
    )
    assert sorted([first.status_code, second.status_code]) == [200, 412]
    current = await client.get("/api/v1/admin/workspace/features/initiatives")
    assert current.headers["etag"] == '"2"'
    assert current.json()["updated_by_name"] == "Dev User"


async def test_disabled_initiatives_hide_all_surfaces_and_preserve_data(client, app):
    project = await create_project(client, key="IPOL", name="Initiative policy")
    await create_wp(client, project["id"], subject="Rollup must remain")
    initiative = (
        await client.post("/api/v1/initiatives", json={"name": "Preserved strategy"})
    ).json()
    linked = await client.post(
        f"/api/v1/initiatives/{initiative['id']}/projects",
        json={"project_id": project["id"]},
    )
    assert linked.status_code == 200
    before_search = await client.get("/api/v1/search?q=Preserved%20strategy")
    assert before_search.json()["initiatives"]["returned"] == 1
    before_projects = await client.get("/api/v1/projects")
    assert before_projects.json()["items"][0]["initiatives"][0]["id"] == initiative["id"]

    disabled = await set_initiatives(client, False)
    assert disabled.status_code == 200
    blocked = await asyncio.gather(
        client.get("/api/v1/initiatives"),
        client.post("/api/v1/initiatives", json={"name": "Blocked"}),
        client.patch(f"/api/v1/initiatives/{initiative['id']}", json={"name": "Blocked"}),
        client.delete(f"/api/v1/initiatives/{initiative['id']}"),
        client.post(
            f"/api/v1/initiatives/{initiative['id']}/projects",
            json={"project_id": project["id"]},
        ),
        client.delete(f"/api/v1/initiatives/{initiative['id']}/projects/{project['id']}"),
    )
    assert {response.status_code for response in blocked} == {404}
    assert {response.json()["detail"] for response in blocked} == {"not found"}

    hidden_search = await client.get("/api/v1/search?q=Preserved%20strategy")
    assert hidden_search.json()["initiatives"] == {
        "items": [],
        "returned": 0,
        "truncated": False,
    }
    hidden_projects = await client.get("/api/v1/projects")
    project_row = hidden_projects.json()["items"][0]
    assert project_row["initiatives"] == []
    assert project_row["initiative_overflow"] == 0
    assert project_row["work_package_count"] == 1
    assert project_row["member_count"] == 1

    async with app.state.sessionmaker() as session:
        assert await session.scalar(select(func.count()).select_from(Initiative)) == 1
        assert await session.scalar(select(func.count()).select_from(InitiativeProject)) == 1

    restored = await set_initiatives(client, True, revision=2)
    assert restored.status_code == 200
    listed = await client.get("/api/v1/initiatives")
    assert [item["id"] for item in listed.json()["items"]] == [initiative["id"]]
    restored_projects = await client.get("/api/v1/projects")
    assert restored_projects.json()["items"][0]["initiatives"][0]["id"] == initiative["id"]
