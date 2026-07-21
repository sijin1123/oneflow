"""Single-level threaded comment replies (expansion PLAN Pass 10 PR-W).

Contract (v10.1): a reply's parent must be a ROOT comment on the same work
package (reply-to-reply 422, cross-WP 422); cross-WP rows are unrepresentable
at the DB level; root delete promotes replies (SET NULL — no thread loss)."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.conftest import create_project, create_wp


async def comment(client, wp_id, body="댓글", parent_id=None):
    payload = {"body": body}
    if parent_id is not None:
        payload["parent_id"] = parent_id
    return await client.post(f"/api/v1/work-packages/{wp_id}/comments", json=payload)


@pytest.fixture
async def project(client):
    return await create_project(client, key="THRD", name="스레드 프로젝트")


async def test_reply_roundtrip_and_flat_list(client, project):
    wp = await create_wp(client, project["id"], subject="스레드 작업")
    root = (await comment(client, wp["id"], "루트 코멘트")).json()
    assert root["parent_id"] is None

    res = await comment(client, wp["id"], "답글입니다", parent_id=root["id"])
    assert res.status_code == 201, res.text
    reply = res.json()
    assert reply["parent_id"] == root["id"]

    # Flat list keeps created_at asc and exposes parent_id (client groups).
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/comments")).json()
    assert [c["parent_id"] for c in listed["items"]] == [None, root["id"]]


async def test_thread_cursor_keeps_replies_with_their_root(client, project):
    wp = await create_wp(client, project["id"], subject="페이지 작업")
    first_root = (await comment(client, wp["id"], "첫 루트")).json()
    first_reply = (await comment(client, wp["id"], "첫 답글", first_root["id"])).json()
    second_root = (await comment(client, wp["id"], "둘째 루트")).json()
    second_reply = (await comment(client, wp["id"], "둘째 답글", second_root["id"])).json()
    third_root = (await comment(client, wp["id"], "셋째 루트")).json()
    base = f"/api/v1/work-packages/{wp['id']}/comment-threads"

    first = (await client.get(f"{base}?limit=1&order=asc")).json()
    assert (first["total_threads"], first["total_comments"]) == (3, 5)
    assert first["items"][0]["root"]["id"] == first_root["id"]
    assert [reply["id"] for reply in first["items"][0]["replies"]] == [first_reply["id"]]
    assert first["next_cursor_id"] == first_root["id"]

    second = (
        await client.get(
            base,
            params={
                "limit": 1,
                "order": "asc",
                "cursor_created_at": first["next_cursor_created_at"],
                "cursor_id": first["next_cursor_id"],
            },
        )
    ).json()
    assert second["items"][0]["root"]["id"] == second_root["id"]
    assert [reply["id"] for reply in second["items"][0]["replies"]] == [second_reply["id"]]

    third = (
        await client.get(
            base,
            params={
                "limit": 1,
                "order": "asc",
                "cursor_created_at": second["next_cursor_created_at"],
                "cursor_id": second["next_cursor_id"],
            },
        )
    ).json()
    assert third["items"][0]["root"]["id"] == third_root["id"]
    assert third["next_cursor_id"] is None

    newest = (await client.get(f"{base}?limit=1&order=desc")).json()
    assert newest["items"][0]["root"]["id"] == third_root["id"]
    assert newest["next_cursor_id"] == third_root["id"]

    assert (await client.get(f"{base}?cursor_id={first_root['id']}")).status_code == 422


async def test_single_level_and_scope_422(client, project):
    pid = project["id"]
    wp = await create_wp(client, pid, subject="검증 작업")
    other_wp = await create_wp(client, pid, subject="다른 작업")
    root = (await comment(client, wp["id"], "루트")).json()
    reply = (await comment(client, wp["id"], "답글", parent_id=root["id"])).json()

    # Reply-to-reply is a clean 422 (depth fixed at 1).
    res = await comment(client, wp["id"], "답답글", parent_id=reply["id"])
    assert res.status_code == 422
    assert "replies to replies" in res.json()["detail"]

    # A parent on another WP (or a nonexistent one) is 422.
    assert (await comment(client, other_wp["id"], "교차", parent_id=root["id"])).status_code == 422
    assert (
        await comment(client, wp["id"], "유령", parent_id="00000000-0000-0000-0000-000000000000")
    ).status_code == 422


async def test_cross_wp_reply_unrepresentable_in_db(client, app, project):
    pid = project["id"]
    wp_a = await create_wp(client, pid, subject="A")
    wp_b = await create_wp(client, pid, subject="B")
    root_a = (await comment(client, wp_a["id"], "A 루트")).json()
    root_b = (await comment(client, wp_b["id"], "B 루트")).json()

    with pytest.raises(IntegrityError):
        async with app.state.sessionmaker() as session, session.begin():
            await session.execute(
                text(
                    "UPDATE work_package_comments SET parent_id = CAST(:parent AS uuid) "
                    "WHERE id = CAST(:id AS uuid)"
                ).bindparams(parent=root_a["id"], id=root_b["id"])
            )


async def test_root_delete_promotes_replies(client, app, project):
    wp = await create_wp(client, project["id"], subject="승격 작업")
    root = (await comment(client, wp["id"], "루트")).json()
    reply = (await comment(client, wp["id"], "답글", parent_id=root["id"])).json()

    # No comment delete API — exercise the FK directly (admin/cleanup path).
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text("DELETE FROM work_package_comments WHERE id = CAST(:id AS uuid)").bindparams(
                id=root["id"]
            )
        )
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/comments")).json()
    assert [(c["id"], c["parent_id"]) for c in listed["items"]] == [(reply["id"], None)]


async def test_reply_guards(client, project, foreign_project):
    pid = project["id"]
    wp = await create_wp(client, pid, subject="가드 작업")
    root = (await comment(client, wp["id"], "루트")).json()

    # Non-member existence hiding on the foreign project's WP.
    foreign_wp = foreign_project["wp_id"]
    assert (await comment(client, str(foreign_wp), "남의 것")).status_code == 404
    assert (
        await client.get(f"/api/v1/work-packages/{foreign_wp}/comment-threads")
    ).status_code == 404

    # Archived project: replies are writes → 409.
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (await comment(client, wp["id"], "답글", parent_id=root["id"])).status_code == 409
    await client.post(f"/api/v1/projects/{pid}/unarchive")
