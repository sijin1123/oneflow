"""Workspace user directory + admin flag (expansion PLAN Pass 33 PR-AY).

Contract (v33.1): the directory is admin-only (403, not existence-hidden);
is_admin gates ONLY this surface — project scopes are never bypassed; the
workspace invariant is at least one ACTIVE admin, enforced under the global
advisory lock; deactivation blocks authentication and NEW project member
adds (409) while existing memberships and history stay intact."""

import asyncio

from sqlalchemy import text

from tests.conftest import create_project


async def demote_dev(app):
    """Test-only backdoor around the endpoint guards."""
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text("UPDATE users SET is_admin = false WHERE email = 'dev@oneflow.local'")
        )


async def test_me_and_directory_crud(client):
    me = (await client.get("/api/v1/me")).json()
    assert me["is_admin"] is True  # dev bootstrap admin

    listed = (await client.get("/api/v1/users")).json()
    assert listed["total"] == 1
    assert listed["items"][0]["email"] == "dev@oneflow.local"

    # Email normalizes to a lowercase login key; registration is NEVER an
    # admin grant (R1-③).
    created = await client.post(
        "/api/v1/users", json={"email": " New.Person@Corp.COM ", "display_name": "  신입  "}
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["email"] == "new.person@corp.com"
    assert body["display_name"] == "신입"
    assert body["is_active"] is True
    assert body["is_admin"] is False

    dup = await client.post(
        "/api/v1/users", json={"email": "new.person@corp.com", "display_name": "중복"}
    )
    assert dup.status_code == 409

    renamed = await client.patch(f"/api/v1/users/{body['id']}", json={"display_name": "정직원"})
    assert renamed.status_code == 200
    assert renamed.json()["display_name"] == "정직원"

    missing = await client.patch(
        "/api/v1/users/00000000-0000-4000-8000-000000000000", json={"display_name": "유령"}
    )
    assert missing.status_code == 404
    assert (
        await client.post("/api/v1/users", json={"email": "nope", "display_name": "x"})
    ).status_code == 422


async def test_non_admin_gets_403(client, app):
    await demote_dev(app)
    assert (await client.get("/api/v1/users")).status_code == 403
    assert (
        await client.post("/api/v1/users", json={"email": "a@b.co", "display_name": "a"})
    ).status_code == 403
    assert (
        await client.patch(
            "/api/v1/users/00000000-0000-4000-8000-000000000000", json={"display_name": "a"}
        )
    ).status_code == 403


async def test_admin_never_bypasses_project_scopes(client, foreign_project):
    """is_admin is not super-admin — foreign projects stay existence-hidden."""
    pid = str(foreign_project["project_id"])
    assert (await client.get(f"/api/v1/projects/{pid}/work-packages")).status_code == 404
    assert (await client.get(f"/api/v1/projects/{pid}/members")).status_code == 404


async def test_deactivation_semantics(client):
    project = await create_project(client, key="USR", name="사용자 프로젝트")
    created = (
        await client.post("/api/v1/users", json={"email": "b@corp.com", "display_name": "B"})
    ).json()

    off = await client.patch(f"/api/v1/users/{created['id']}", json={"is_active": False})
    assert off.status_code == 200
    assert off.json()["is_active"] is False

    # A deactivated account never enters a NEW project (R1-⑤).
    add = await client.post(
        f"/api/v1/projects/{project['id']}/members",
        json={"email": "b@corp.com", "role": "member"},
    )
    assert add.status_code == 409

    # Self-deactivation is a 422 — not last-admin, a plain footgun guard.
    me = (await client.get("/api/v1/me")).json()
    self_off = await client.patch(f"/api/v1/users/{me['id']}", json={"is_active": False})
    assert self_off.status_code == 422

    # Reactivate → member add works again (memberships were never touched).
    assert (
        await client.patch(f"/api/v1/users/{created['id']}", json={"is_active": True})
    ).status_code == 200
    assert (
        await client.post(
            f"/api/v1/projects/{project['id']}/members",
            json={"email": "b@corp.com", "role": "member"},
        )
    ).status_code == 201


async def test_inactive_account_is_blocked_from_auth(client, app):
    """Deactivation blocks every authenticated call with an explicit 403."""
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text("UPDATE users SET is_active = false WHERE email = 'dev@oneflow.local'")
        )
    res = await client.get("/api/v1/me")
    assert res.status_code == 403
    assert res.json()["detail"] == "account disabled"


async def test_last_active_admin_invariant(client):
    """The invariant counts ACTIVE admins (R1-①): a workspace where only a
    deactivated admin remains is unadministrable."""
    me = (await client.get("/api/v1/me")).json()
    other = (
        await client.post(
            "/api/v1/users", json={"email": "adm@corp.com", "display_name": "부관리자"}
        )
    ).json()
    assert (
        await client.patch(f"/api/v1/users/{other['id']}", json={"is_admin": True})
    ).status_code == 200

    # Deactivate the second admin — fine, dev stays the active admin.
    assert (
        await client.patch(f"/api/v1/users/{other['id']}", json={"is_active": False})
    ).status_code == 200

    # Now dev is the LAST ACTIVE admin: revoking own flag would leave only a
    # deactivated admin → 422.
    res = await client.patch(f"/api/v1/users/{me['id']}", json={"is_admin": False})
    assert res.status_code == 422

    # Reactivating the second admin unblocks the same revoke.
    assert (
        await client.patch(f"/api/v1/users/{other['id']}", json={"is_active": True})
    ).status_code == 200
    assert (
        await client.patch(f"/api/v1/users/{me['id']}", json={"is_admin": False})
    ).status_code == 200
    # ...and the caller is no longer admin.
    assert (await client.get("/api/v1/users")).status_code == 403


async def test_concurrent_admin_mutations_hold_invariant(client, app):
    """Two admins racing to demote each other must not zero the workspace —
    the global advisory lock (427005) serializes the count-then-write."""
    me = (await client.get("/api/v1/me")).json()
    other = (
        await client.post(
            "/api/v1/users", json={"email": "race@corp.com", "display_name": "레이스"}
        )
    ).json()
    assert (
        await client.patch(f"/api/v1/users/{other['id']}", json={"is_admin": True})
    ).status_code == 200

    r1, r2 = await asyncio.gather(
        client.patch(f"/api/v1/users/{me['id']}", json={"is_admin": False}),
        client.patch(f"/api/v1/users/{other['id']}", json={"is_admin": False}),
    )
    codes = sorted([r1.status_code, r2.status_code])
    # Exactly one demotion may win. The loser sees 422 (last-active-admin
    # under the lock) — or 403 when the caller's own demotion landed first
    # (both callers authenticate as dev). Never two 200s.
    assert codes[0] == 200 and codes[1] in (403, 422), codes

    async with app.state.sessionmaker() as session:
        count = (
            await session.execute(text("SELECT count(*) FROM users WHERE is_admin AND is_active"))
        ).scalar_one()
    assert count == 1
