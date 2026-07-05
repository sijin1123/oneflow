"""Project members and role-based authorization (PLAN §5 Phase 2)."""

import asyncio

import pytest
from sqlalchemy import func, select

from app.models import ProjectMember, User
from tests.conftest import create_project


@pytest.fixture
async def other_user(app):
    async with app.state.sessionmaker() as session, session.begin():
        u = User(email="alex@oneflow.local", display_name="Alex")
        session.add(u)
        await session.flush()
        return {"id": u.id, "email": u.email}


async def test_creator_is_listed_as_owner(client, dev_user):
    project = await create_project(client, key="MEM")
    res = await client.get(f"/api/v1/projects/{project['id']}/members")
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["role"] == "owner"
    assert body["items"][0]["user_id"] == str(dev_user.id)


async def test_add_update_remove_member(client, other_user):
    project = await create_project(client, key="MG")
    add = await client.post(
        f"/api/v1/projects/{project['id']}/members",
        json={"email": other_user["email"], "role": "member"},
    )
    assert add.status_code == 201
    assert add.json()["role"] == "member"

    assert (await client.get(f"/api/v1/projects/{project['id']}/members")).json()["total"] == 2

    promote = await client.patch(
        f"/api/v1/projects/{project['id']}/members/{other_user['id']}",
        json={"role": "owner"},
    )
    assert promote.status_code == 200 and promote.json()["role"] == "owner"

    removed = await client.delete(f"/api/v1/projects/{project['id']}/members/{other_user['id']}")
    assert removed.status_code == 204
    assert (await client.get(f"/api/v1/projects/{project['id']}/members")).json()["total"] == 1


async def test_add_unknown_email_404(client):
    project = await create_project(client, key="UE")
    res = await client.post(
        f"/api/v1/projects/{project['id']}/members",
        json={"email": "ghost@oneflow.local"},
    )
    assert res.status_code == 404


async def test_add_duplicate_member_409(client, other_user):
    project = await create_project(client, key="DM")
    payload = {"email": other_user["email"]}
    assert (
        await client.post(f"/api/v1/projects/{project['id']}/members", json=payload)
    ).status_code == 201
    dup = await client.post(f"/api/v1/projects/{project['id']}/members", json=payload)
    assert dup.status_code == 409


async def test_cannot_remove_last_owner(client, dev_user):
    project = await create_project(client, key="LO")
    res = await client.delete(f"/api/v1/projects/{project['id']}/members/{dev_user.id}")
    assert res.status_code == 422


async def test_cannot_demote_last_owner(client, dev_user):
    project = await create_project(client, key="DO")
    res = await client.patch(
        f"/api/v1/projects/{project['id']}/members/{dev_user.id}",
        json={"role": "member"},
    )
    assert res.status_code == 422


async def test_concurrent_owner_demotions_keep_one_owner(app, client, dev_user, other_user):
    # Two owners; fire both demotions concurrently. The per-project advisory lock
    # serializes the count-then-write so the project never drops to zero owners
    # (fable5 audit: last-owner check-then-write race).
    project = await create_project(client, key="RACE2")
    pid = project["id"]
    await client.post(
        f"/api/v1/projects/{pid}/members",
        json={"email": other_user["email"], "role": "owner"},
    )
    r1, r2 = await asyncio.gather(
        client.patch(f"/api/v1/projects/{pid}/members/{dev_user.id}", json={"role": "member"}),
        client.patch(f"/api/v1/projects/{pid}/members/{other_user['id']}", json={"role": "member"}),
    )
    statuses = sorted([r1.status_code, r2.status_code])
    # Exactly one demotion succeeds; the other is refused — either 422 (last-owner
    # guard) or 403 (the acting owner demoted itself first, losing the owner role).
    # The invariant that matters: the project never drops below one owner.
    assert statuses[0] == 200 and statuses[1] in (403, 422)
    async with app.state.sessionmaker() as session:
        owners = (
            await session.execute(
                select(func.count())
                .select_from(ProjectMember)
                .where(ProjectMember.project_id == pid, ProjectMember.role == "owner")
            )
        ).scalar_one()
    assert owners == 1


async def test_member_cannot_manage_members_403(app, client, other_user):
    # dev user creates a project and adds `other` as a plain member, then demotes
    # itself is blocked... instead: make `other` a member, and act AS other via a
    # role check. Since dev auth is a single user, simulate by having the project
    # owned by `other` and dev as a mere member.
    async with app.state.sessionmaker() as session, session.begin():
        from app.models import Project

        project = Project(key="ROL", name="역할 테스트")
        session.add(project)
        await session.flush()
        dev = (
            await session.execute(select(User).where(User.email == "dev@oneflow.local"))
        ).scalar_one()
        session.add_all(
            [
                ProjectMember(project_id=project.id, user_id=other_user["id"], role="owner"),
                ProjectMember(project_id=project.id, user_id=dev.id, role="member"),
            ]
        )
        pid = project.id
    # dev (the acting user) is a member but not owner → 403 on member management
    res = await client.post(f"/api/v1/projects/{pid}/members", json={"email": other_user["email"]})
    assert res.status_code == 403


async def test_nonmember_members_hidden(client, foreign_project):
    pid = foreign_project["project_id"]
    assert (await client.get(f"/api/v1/projects/{pid}/members")).status_code == 404
    assert (
        await client.post(f"/api/v1/projects/{pid}/members", json={"email": "x@y.zz"})
    ).status_code == 404  # existence hiding before role check
