"""Comment emoji reactions (expansion PLAN Pass 17 PR-AI).

Contract (v17.1): stable ASCII keys in API/DB (no Unicode drift); PUT is
idempotent via ON CONFLICT DO NOTHING (concurrent PUTs both 200); DELETE is a
rowcount-ignored conditional; the aggregate always returns all six slots in
fixed order; reactions die with their comment (CASCADE)."""

import asyncio

import pytest
from sqlalchemy import text

from app.models.comment import REACTION_KEYS
from tests.conftest import create_project, create_wp


async def react(client, comment_id, key="thumbs_up"):
    return await client.put(f"/api/v1/comments/{comment_id}/reactions/{key}")


async def unreact(client, comment_id, key="thumbs_up"):
    return await client.delete(f"/api/v1/comments/{comment_id}/reactions/{key}")


@pytest.fixture
async def wp(client):
    project = await create_project(client, key="REAC", name="리액션 프로젝트")
    return await create_wp(client, project["id"], subject="리액션 작업")


async def comment(client, wp_id, body="댓글"):
    res = await client.post(f"/api/v1/work-packages/{wp_id}/comments", json={"body": body})
    return res.json()


async def test_toggle_idempotent_and_fixed_slots(client, wp):
    c = await comment(client, wp["id"])
    # Fresh comment: all six slots, zero counts, fixed order.
    assert [r["key"] for r in c["reactions"]] == list(REACTION_KEYS)
    assert all(r["count"] == 0 and r["me"] is False for r in c["reactions"])

    res = await react(client, c["id"], "heart")
    assert res.status_code == 200, res.text
    heart = next(r for r in res.json()["items"] if r["key"] == "heart")
    assert (heart["count"], heart["me"]) == (1, True)

    # Duplicate PUT is a 200 no-op (idempotent), count stays 1.
    res = await react(client, c["id"], "heart")
    heart = next(r for r in res.json()["items"] if r["key"] == "heart")
    assert heart["count"] == 1

    # List aggregation matches.
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/comments")).json()
    heart = next(r for r in listed["items"][0]["reactions"] if r["key"] == "heart")
    assert (heart["count"], heart["me"]) == (1, True)

    # DELETE is idempotent too (missing row → still 204).
    assert (await unreact(client, c["id"], "heart")).status_code == 204
    assert (await unreact(client, c["id"], "heart")).status_code == 204
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/comments")).json()
    assert all(r["count"] == 0 for r in listed["items"][0]["reactions"])

    # Unknown key is a 422 (path grammar + vocabulary).
    assert (await react(client, c["id"], "sparkles")).status_code == 422


async def test_concurrent_puts_both_succeed(client, wp):
    c = await comment(client, wp["id"])
    r1, r2 = await asyncio.gather(react(client, c["id"], "tada"), react(client, c["id"], "tada"))
    assert (r1.status_code, r2.status_code) == (200, 200)
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/comments")).json()
    tada = next(r for r in listed["items"][0]["reactions"] if r["key"] == "tada")
    assert tada["count"] == 1  # unique per (comment, user, emoji)


async def test_reactions_die_with_comment(client, app, wp):
    c = await comment(client, wp["id"])
    await react(client, c["id"], "smile")
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text("DELETE FROM work_package_comments WHERE id = CAST(:id AS uuid)").bindparams(
                id=c["id"]
            )
        )
        remaining = (
            await session.execute(text("SELECT count(*) FROM comment_reactions"))
        ).scalar_one()
    assert remaining == 0  # CASCADE — ephemeral social signal


async def test_guards(client, wp, foreign_project):
    c = await comment(client, wp["id"])
    pid = wp["project_id"]

    # Nonexistent comment → 404 (and the FK race path maps the same way).
    ghost = "00000000-0000-0000-0000-000000000000"
    assert (await react(client, ghost)).status_code == 404

    # Archived project: mutation 409, read keeps serving aggregates.
    await react(client, c["id"], "thumbs_up")
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (await react(client, c["id"], "tada")).status_code == 409
    assert (await unreact(client, c["id"], "thumbs_up")).status_code == 409
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/comments")).json()
    up = next(r for r in listed["items"][0]["reactions"] if r["key"] == "thumbs_up")
    assert up["count"] == 1
    await client.post(f"/api/v1/projects/{pid}/unarchive")
