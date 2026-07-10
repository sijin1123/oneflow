"""Workspace membership report (Pass 62 PR-CB, v62.1 R1-②/④).

Governance READ only: admins see any user's project memberships (minimal
fields, limit/offset + full total, name-sorted); non-admins get 403 (directory
contract — not existence-hidden); unknown users 404. Membership WRITES remain
owner-only per project — this surface changes nothing about Pass 33.
"""

import uuid

from sqlalchemy import text

from app.models import Project, ProjectMember, User
from tests.conftest import create_project


async def _seed_memberships(app, client, dev_user):
    """A target user who is member/viewer/owner across three projects (one
    archived), plus one unrelated project the target is NOT in."""
    async with app.state.sessionmaker() as session, session.begin():
        target = User(email="target@oneflow.local", display_name="Target", is_active=False)
        pa = Project(key="MA", name="가 프로젝트")
        pb = Project(key="MB", name="나 프로젝트")
        pc = Project(key="MC", name="다 프로젝트")
        other = Project(key="MD", name="무관 프로젝트")
        session.add_all([target, pa, pb, pc, other])
        await session.flush()
        session.add_all(
            [
                ProjectMember(project_id=pa.id, user_id=target.id, role="member"),
                ProjectMember(project_id=pb.id, user_id=target.id, role="viewer"),
                ProjectMember(project_id=pc.id, user_id=target.id, role="owner"),
                ProjectMember(project_id=pa.id, user_id=dev_user.id, role="owner"),
                ProjectMember(project_id=other.id, user_id=dev_user.id, role="owner"),
            ]
        )
        pb_id = pb.id
        target_id = target.id
    # Archive one membership project through the API (dev is not a member of
    # pb — archive it directly; state matters, not the actor).
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text("UPDATE projects SET archived_at = now() WHERE id = :pid").bindparams(pid=pb_id)
        )
    return str(target_id)


async def test_memberships_listing_sorted_with_roles_and_archived(app, client, dev_user):
    target_id = await _seed_memberships(app, client, dev_user)
    res = await client.get(f"/api/v1/users/{target_id}/memberships")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 3
    # Name-sorted; the unrelated project never appears.
    assert [(i["project_key"], i["role"], i["archived"]) for i in body["items"]] == [
        ("MA", "member", False),
        ("MB", "viewer", True),
        ("MC", "owner", False),
    ]
    # Minimal-field policy (v62.1 R1-②): exactly these keys, nothing more.
    assert set(body["items"][0]) == {
        "project_id",
        "project_key",
        "project_name",
        "role",
        "archived",
    }


async def test_memberships_limit_offset_and_total(app, client, dev_user):
    target_id = await _seed_memberships(app, client, dev_user)
    res = await client.get(f"/api/v1/users/{target_id}/memberships?limit=2&offset=2")
    body = res.json()
    assert body["total"] == 3  # full count regardless of the page
    assert [i["project_key"] for i in body["items"]] == ["MC"]
    assert (await client.get(f"/api/v1/users/{target_id}/memberships?limit=0")).status_code == 422
    assert (await client.get(f"/api/v1/users/{target_id}/memberships?limit=201")).status_code == 422


async def test_memberships_non_admin_403_and_unknown_404(app, client, dev_user):
    unknown = uuid.uuid4()
    assert (await client.get(f"/api/v1/users/{unknown}/memberships")).status_code == 404

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text("UPDATE users SET is_admin = false WHERE email = 'dev@oneflow.local'")
        )
    res = await client.get(f"/api/v1/users/{dev_user.id}/memberships")
    assert res.status_code == 403


async def test_memberships_empty_user_and_self(client, dev_user):
    """A user with no memberships returns an empty page; admins may inspect
    themselves too (no special-casing)."""
    created = (
        await client.post(
            "/api/v1/users", json={"email": "nobody@corp.com", "display_name": "무소속"}
        )
    ).json()
    res = await client.get(f"/api/v1/users/{created['id']}/memberships")
    assert res.json() == {"items": [], "total": 0}

    project = await create_project(client, key="SELF")
    res = await client.get(f"/api/v1/users/{dev_user.id}/memberships")
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["project_id"] == project["id"]
    assert body["items"][0]["role"] == "owner"
