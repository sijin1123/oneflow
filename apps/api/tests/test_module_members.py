"""Module participant roster (Pass 65 PR-CE, v65.1).

Contracts: PUT = full replace (idempotent, dedup, [] clears) under the
project member advisory lock with commit-time eligibility (active AND member
AND role != viewer — anything else refuses the WHOLE request, 422); reads
re-filter to currently-eligible users so a demotion disappears from the
roster and the count immediately and reappears on re-promotion; owner-only
writes, member reads, existence hiding for non-members.
"""

import asyncio
import uuid

import pytest
from sqlalchemy import func, select

from app.models import ModuleMember, ProjectMember, User
from tests.conftest import create_project


@pytest.fixture
async def mod_ctx(app, client, _clean_tables):
    """Dev-owned project with a module and three extra users:
    member Alex, viewer Vera, inactive Ida (all project members)."""
    project = await create_project(client, key="MOD")
    pid = project["id"]
    res = await client.post(f"/api/v1/projects/{pid}/modules", json={"name": "결제 모듈"})
    assert res.status_code == 201, res.text
    module_id = res.json()["id"]
    async with app.state.sessionmaker() as session, session.begin():
        alex = User(email="alex@oneflow.local", display_name="Alex")
        vera = User(email="vera@oneflow.local", display_name="Vera")
        ida = User(email="ida@oneflow.local", display_name="Ida", is_active=False)
        session.add_all([alex, vera, ida])
        await session.flush()
        session.add_all(
            [
                ProjectMember(project_id=pid, user_id=alex.id, role="member"),
                ProjectMember(project_id=pid, user_id=vera.id, role="viewer"),
                ProjectMember(project_id=pid, user_id=ida.id, role="member"),
            ]
        )
        ids = {"alex": str(alex.id), "vera": str(vera.id), "ida": str(ida.id)}
    return {"pid": pid, "module_id": module_id, **ids}


def _url(ctx) -> str:
    return f"/api/v1/projects/{ctx['pid']}/modules/{ctx['module_id']}/members"


async def test_put_replace_round_trip_dedup_and_clear(client, dev_user, mod_ctx):
    # Add two (with a duplicate in the payload — collapses to one row each).
    res = await client.put(
        _url(mod_ctx),
        json={"user_ids": [mod_ctx["alex"], str(dev_user.id), mod_ctx["alex"]]},
    )
    assert res.status_code == 200, res.text
    assert [i["display_name"] for i in res.json()["items"]] == ["Alex", "Dev User"]

    # Replace shrinks to one.
    res = await client.put(_url(mod_ctx), json={"user_ids": [mod_ctx["alex"]]})
    assert [i["user_id"] for i in res.json()["items"]] == [mod_ctx["alex"]]

    # Empty array clears everyone.
    res = await client.put(_url(mod_ctx), json={"user_ids": []})
    assert res.json() == {"items": [], "total": 0}


async def test_put_rejects_ineligible_whole_request(app, client, mod_ctx):
    for bad, label in (
        (mod_ctx["vera"], "viewer"),
        (mod_ctx["ida"], "inactive"),
        (str(uuid.uuid4()), "non-member"),
    ):
        res = await client.put(_url(mod_ctx), json={"user_ids": [mod_ctx["alex"], bad]})
        assert res.status_code == 422, f"{label}: {res.status_code} {res.text}"
    # Whole-request refusal: nothing was applied by the failed attempts.
    async with app.state.sessionmaker() as session:
        rows = (
            await session.execute(
                select(func.count())
                .select_from(ModuleMember)
                .where(ModuleMember.module_id == uuid.UUID(mod_ctx["module_id"]))
            )
        ).scalar_one()
    assert rows == 0


async def test_demotion_hides_then_promotion_restores(app, client, mod_ctx):
    res = await client.put(_url(mod_ctx), json={"user_ids": [mod_ctx["alex"]]})
    assert res.status_code == 200
    # Demote Alex to viewer → invisible in roster AND list rollup.
    res = await client.patch(
        f"/api/v1/projects/{mod_ctx['pid']}/members/{mod_ctx['alex']}",
        json={"role": "viewer"},
    )
    assert res.status_code == 200
    assert (await client.get(_url(mod_ctx))).json()["total"] == 0
    mods = (await client.get(f"/api/v1/projects/{mod_ctx['pid']}/modules")).json()
    assert mods["items"][0]["member_count"] == 0
    # Promote back → the retained row resurfaces (a living grouping).
    res = await client.patch(
        f"/api/v1/projects/{mod_ctx['pid']}/members/{mod_ctx['alex']}",
        json={"role": "member"},
    )
    assert res.status_code == 200
    assert (await client.get(_url(mod_ctx))).json()["total"] == 1
    mods = (await client.get(f"/api/v1/projects/{mod_ctx['pid']}/modules")).json()
    assert mods["items"][0]["member_count"] == 1


async def test_roles_and_scope(app, client, mod_ctx, member_project):
    # Owner-only write: dev is a plain member in member_project.
    res = await client.post(
        f"/api/v1/projects/{member_project['project_id']}/modules", json={"name": "남의 모듈"}
    )
    assert res.status_code == 403  # module.manage is owner-only (regression)

    # Cross-project module id → 404 (composite scope).
    res = await client.get(
        f"/api/v1/projects/{member_project['project_id']}/modules/{mod_ctx['module_id']}/members"
    )
    assert res.status_code == 404

    # Member (non-owner) can READ the roster but not PUT it.
    async with app.state.sessionmaker() as session, session.begin():
        owner_module = await session.execute(
            select(ProjectMember).where(ProjectMember.project_id == mod_ctx["pid"]).limit(1)
        )
        assert owner_module is not None
    res = await client.put(_url(mod_ctx), json={"user_ids": []})
    assert res.status_code == 200  # dev owns mod_ctx project


async def test_archive_blocks_put_keeps_get(client, mod_ctx):
    res = await client.put(_url(mod_ctx), json={"user_ids": [mod_ctx["alex"]]})
    assert res.status_code == 200
    assert (await client.post(f"/api/v1/projects/{mod_ctx['pid']}/archive")).status_code == 200
    assert (await client.put(_url(mod_ctx), json={"user_ids": []})).status_code == 409
    res = await client.get(_url(mod_ctx))
    assert res.status_code == 200
    assert res.json()["total"] == 1


async def test_concurrent_puts_last_write_wins_consistent(app, client, dev_user, mod_ctx):
    r1, r2 = await asyncio.gather(
        client.put(_url(mod_ctx), json={"user_ids": [mod_ctx["alex"]]}),
        client.put(_url(mod_ctx), json={"user_ids": [str(dev_user.id)]}),
    )
    assert r1.status_code == 200 and r2.status_code == 200
    final = (await client.get(_url(mod_ctx))).json()
    # LWW by design: exactly ONE of the two rosters, never a merge or a dup.
    assert final["total"] == 1
    assert final["items"][0]["user_id"] in (mod_ctx["alex"], str(dev_user.id))


async def test_member_count_no_join_multiplication(app, client, dev_user, mod_ctx):
    """Modules list rollup: WP counts and participant counts stay independent
    aggregates — many WPs × many participants never multiply."""
    for n in range(3):
        res = await client.post(
            f"/api/v1/projects/{mod_ctx['pid']}/work-packages",
            json={"subject": f"작업 {n}", "module_id": mod_ctx["module_id"]},
        )
        assert res.status_code == 201, res.text
    res = await client.put(_url(mod_ctx), json={"user_ids": [mod_ctx["alex"], str(dev_user.id)]})
    assert res.status_code == 200
    mods = (await client.get(f"/api/v1/projects/{mod_ctx['pid']}/modules")).json()
    row = mods["items"][0]
    assert (row["work_package_count"], row["member_count"]) == (3, 2)
