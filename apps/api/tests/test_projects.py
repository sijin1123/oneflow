"""Projects CRU, key conflicts, atomic owner membership, membership scoping (§13)."""

import asyncio

from sqlalchemy import func, select

from app.models import ProjectMember, User
from tests.conftest import create_project


async def test_cru_roundtrip(client):
    created = await create_project(client, key="ONE", name="OneFlow")
    single = await client.get(f"/api/v1/projects/{created['id']}")
    assert single.status_code == 200
    assert single.json()["key"] == "ONE"
    listed = await client.get("/api/v1/projects")
    body = listed.json()
    assert body["total"] == 1 and len(body["items"]) == 1  # envelope contract


async def test_duplicate_key_409(client):
    await create_project(client, key="DUP")
    res = await client.post("/api/v1/projects", json={"key": "DUP", "name": "다른 이름"})
    assert res.status_code == 409


async def test_patch_project_null_name_rejected(client):
    # Explicit null on the NOT NULL name is a 422, never an unhandled 500.
    project = await create_project(client, key="PN", name="이름 있음")
    res = await client.patch(f"/api/v1/projects/{project['id']}", json={"name": None})
    assert res.status_code == 422


async def test_patch_project_name_and_description(client):
    project = await create_project(client, key="PE", name="원래 이름")
    res = await client.patch(
        f"/api/v1/projects/{project['id']}",
        json={"name": "새 이름", "description": "설명 추가"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "새 이름" and body["description"] == "설명 추가"


async def test_double_post_second_409(client):
    payload = {"key": "TWICE", "name": "더블클릭"}
    first = await client.post("/api/v1/projects", json=payload)
    second = await client.post("/api/v1/projects", json=payload)  # POST is not idempotent (§1.3)
    assert first.status_code == 201
    assert second.status_code == 409


async def test_concurrent_create_same_key(app, client):
    payload = {"key": "RACE", "name": "동시 생성"}
    r1, r2 = await asyncio.gather(
        client.post("/api/v1/projects", json=payload),
        client.post("/api/v1/projects", json=payload),
    )
    assert sorted([r1.status_code, r2.status_code]) == [201, 409]
    # Atomicity: the failed transaction must leave no orphan membership.
    async with app.state.sessionmaker() as session:
        memberships = (
            await session.execute(select(func.count()).select_from(ProjectMember))
        ).scalar_one()
    assert memberships == 1


async def test_creator_gets_owner_membership(app, client, dev_user):
    created = await create_project(client, key="OWN")
    async with app.state.sessionmaker() as session:
        row = (
            await session.execute(select(ProjectMember).where(ProjectMember.user_id == dev_user.id))
        ).scalar_one()
    assert str(row.project_id) == created["id"]
    assert row.role == "owner"


async def test_nonmember_hidden(client, foreign_project):
    listed = await client.get("/api/v1/projects")
    assert listed.json()["total"] == 0  # foreign project filtered out
    single = await client.get(f"/api/v1/projects/{foreign_project['project_id']}")
    assert single.status_code == 404  # existence hiding


async def test_list_pagination_validation(client):
    assert (await client.get("/api/v1/projects", params={"limit": 0})).status_code == 422
    assert (await client.get("/api/v1/projects", params={"limit": 501})).status_code == 422
    assert (await client.get("/api/v1/projects", params={"offset": -1})).status_code == 422


async def test_body_validation(client):
    assert (
        await client.post("/api/v1/projects", json={"key": "bad", "name": "x"})
    ).status_code == 422  # key regex
    assert (
        await client.post("/api/v1/projects", json={"key": "OK", "name": "   "})
    ).status_code == 422  # blank name after trim
    assert (
        await client.post(
            "/api/v1/projects", json={"key": "OK", "name": "n", "description": "x" * 20_001}
        )
    ).status_code == 422  # description cap


async def test_dev_user_auto_provisioning(app, client):
    # Fresh DB with NO users at all: first request must auto-provision, never 500 (§5).
    from sqlalchemy import text

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(text("DELETE FROM users"))
    res = await client.get("/api/v1/projects")
    assert res.status_code == 200
    async with app.state.sessionmaker() as session:
        count = (await session.execute(select(func.count()).select_from(User))).scalar_one()
    assert count == 1
