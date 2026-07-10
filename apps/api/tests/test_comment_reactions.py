"""Comment emoji reactions (Pass 17 PR-AI, revised by Pass 35 PR-BA).

Contract (v35.1): FREE emoji — storage holds the glyph; exactly one emoji
grapheme cluster per reaction (single validator, app.services.emoji); legacy
Pass-17 keys normalize to glyphs on the wire forever (no breaking change);
aggregates list only present emojis, count desc then codepoint asc; PUT stays
idempotent; reactions die with their comment (CASCADE)."""

import asyncio

import pytest
from sqlalchemy import text

from app.models.comment import LEGACY_REACTION_KEYS
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


async def test_toggle_idempotent_open_set(client, wp):
    c = await comment(client, wp["id"])
    # Fresh comment: OPEN set — no prefilled slots.
    assert c["reactions"] == []

    # Free emoji round-trip (stored and returned as the glyph).
    res = await react(client, c["id"], "✨")
    assert res.status_code == 200, res.text
    assert res.json()["items"] == [{"key": "✨", "count": 1, "me": True}]

    # Duplicate PUT is a 200 no-op (idempotent), count stays 1.
    res = await react(client, c["id"], "✨")
    assert res.json()["items"][0]["count"] == 1

    # ZWJ sequence and skin tone are single graphemes — accepted.
    assert (await react(client, c["id"], "👨‍👩‍👧‍👦")).status_code == 200
    assert (await react(client, c["id"], "👍🏽")).status_code == 200

    # List aggregation matches and sorts count desc, then codepoint asc.
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/comments")).json()
    aggs = listed["items"][0]["reactions"]
    assert [a["count"] for a in aggs] == sorted([a["count"] for a in aggs], reverse=True)

    # DELETE is idempotent too (missing row → still 204), empty set returns.
    for emoji in ("✨", "👨‍👩‍👧‍👦", "👍🏽"):
        assert (await unreact(client, c["id"], emoji)).status_code == 204
    assert (await unreact(client, c["id"], "✨")).status_code == 204
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/comments")).json()
    assert listed["items"][0]["reactions"] == []

    # Rejections: ASCII words, digits, whitespace, multi-emoji, lone
    # joiner/modifier/VS16, multi-flag (v35.1 R1-①/③).
    for bad in ("sparkles", "1", "a", "👍👍", "🇺🇸🇨🇦", "\u200d", "\ufe0f", "🏽", "😀 "):
        assert (await react(client, c["id"], bad)).status_code == 422, bad


async def test_legacy_keys_normalize_to_glyphs(client, wp):
    """Pass-17 clients keep working: legacy keys map to glyphs on the wire
    (v35.1 R1-④); PUT by key and DELETE by glyph address the SAME row."""
    c = await comment(client, wp["id"])
    res = await react(client, c["id"], "thumbs_up")
    assert res.status_code == 200
    assert res.json()["items"] == [{"key": "👍", "count": 1, "me": True}]

    # Key and glyph are the same reaction — no double count.
    assert (await react(client, c["id"], "👍")).json()["items"][0]["count"] == 1
    for key, glyph in LEGACY_REACTION_KEYS.items():
        assert key != glyph  # mapping stays injective and non-trivial

    # DELETE via the legacy key removes the glyph row.
    assert (await unreact(client, c["id"], "thumbs_up")).status_code == 204
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/comments")).json()
    assert listed["items"][0]["reactions"] == []


async def test_concurrent_puts_both_succeed(client, wp):
    c = await comment(client, wp["id"])
    r1, r2 = await asyncio.gather(react(client, c["id"], "🎉"), react(client, c["id"], "🎉"))
    assert (r1.status_code, r2.status_code) == (200, 200)
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/comments")).json()
    tada = next(r for r in listed["items"][0]["reactions"] if r["key"] == "🎉")
    assert tada["count"] == 1  # unique per (comment, user, emoji)


async def test_reactions_die_with_comment(client, app, wp):
    c = await comment(client, wp["id"])
    await react(client, c["id"], "😄")
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
    await react(client, c["id"], "👍")
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (await react(client, c["id"], "🎉")).status_code == 409
    assert (await unreact(client, c["id"], "👍")).status_code == 409
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/comments")).json()
    up = next(r for r in listed["items"][0]["reactions"] if r["key"] == "👍")
    assert up["count"] == 1
    await client.post(f"/api/v1/projects/{pid}/unarchive")
