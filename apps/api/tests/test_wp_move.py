"""Cross-project work-package move (Pass 66 PR-CF, v66.1).

A move transfers ownership AND visibility wholesale (comments/time/history
travel); project-scoped references cannot: parent/children detach, relations/
custom values/document links are deleted (dry_run previews first), watchers
and the assignee re-check target eligibility, attachments and old
notifications follow with their denormalized project_id updated. Source gate
is OWNER; target gate is member write. Blob keys never move.
"""

import uuid

import pytest
from sqlalchemy import select

from app.models import (
    Attachment,
    Notification,
    ProjectMember,
    User,
    WorkPackage,
    WorkPackageRelation,
)
from tests.conftest import create_project, create_wp


@pytest.fixture
async def move_ctx(app, client, _clean_tables):
    """Dev owns SOURCE and TARGET; Alex is member of source only,
    Bora is member of both (watcher/assignee survivor)."""
    src = await create_project(client, key="SRC", name="출발")
    dst = await create_project(client, key="DST", name="도착")
    async with app.state.sessionmaker() as session, session.begin():
        alex = User(email="alex@oneflow.local", display_name="Alex")
        bora = User(email="bora@oneflow.local", display_name="Bora")
        session.add_all([alex, bora])
        await session.flush()
        session.add_all(
            [
                ProjectMember(project_id=src["id"], user_id=alex.id, role="member"),
                ProjectMember(project_id=src["id"], user_id=bora.id, role="member"),
                ProjectMember(project_id=dst["id"], user_id=bora.id, role="member"),
            ]
        )
        ids = {"alex": str(alex.id), "bora": str(bora.id)}
    return {"src": src["id"], "dst": dst["id"], **ids}


async def _move(client, wp_id, target, version=0, dry=False):
    return await client.post(
        f"/api/v1/work-packages/{wp_id}/move",
        json={"target_project_id": target, "expected_version": version, "dry_run": dry},
    )


async def test_move_transfers_and_clears_scoped_references(app, client, move_ctx):
    src, dst = move_ctx["src"], move_ctx["dst"]
    # Rich source WP: parent, child, milestone, relation, comment, time entry,
    # watchers (Alex source-only, Bora both), assignee Bora.
    parent = await create_wp(client, src, subject="부모")
    wp = await create_wp(client, src, subject="이동 대상", assignee_id=move_ctx["bora"])
    child = await create_wp(client, src, subject="자식")
    other = await create_wp(client, src, subject="관계 상대")
    for pid, body in (
        (wp["id"], {"expected_version": 0, "parent_id": parent["id"]}),
        (child["id"], {"expected_version": 0, "parent_id": wp["id"]}),
    ):
        res = await client.patch(f"/api/v1/work-packages/{pid}", json=body)
        assert res.status_code == 200, res.text
    res = await client.post(
        f"/api/v1/work-packages/{wp['id']}/relations",
        json={"target_id": other["id"], "relation_type": "relates"},
    )
    assert res.status_code == 201, res.text
    res = await client.post(
        f"/api/v1/work-packages/{wp['id']}/comments", json={"body": "출발지에서 쓴 댓글"}
    )
    assert res.status_code == 201
    res = await client.post(
        f"/api/v1/work-packages/{wp['id']}/time-entries",
        json={"hours": 2, "spent_on": "2026-07-01"},
    )
    assert res.status_code == 201
    assert (await client.put(f"/api/v1/work-packages/{wp['id']}/watchers/me")).status_code == 204
    async with app.state.sessionmaker() as session, session.begin():
        from app.models.watcher import WpWatcher

        session.add_all(
            [
                WpWatcher(work_package_id=wp["id"], user_id=move_ctx["alex"]),
                WpWatcher(work_package_id=wp["id"], user_id=move_ctx["bora"]),
            ]
        )

    # dry_run first: nothing changes, preview names present.
    res = await _move(client, wp["id"], dst, version=1, dry=True)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["dry_run"] is True and body["work_package"] is None
    assert body["cleared"]["parent"] is True
    assert body["cleared"]["children"] == {"count": 1, "names": ["자식"], "overflow": 0}
    assert body["cleared"]["relations"]["names"] == ["관계 상대"]
    assert body["cleared"]["watchers_removed"]["names"] == ["Alex"]  # source-only
    assert body["cleared"]["assignee_cleared"] is False  # Bora is in both
    still = (await client.get(f"/api/v1/work-packages/{wp['id']}")).json()
    assert still["project_id"] == src  # untouched

    # Real move.
    res = await _move(client, wp["id"], dst, version=1)
    assert res.status_code == 200, res.text
    moved = res.json()["work_package"]
    assert moved["project_id"] == dst
    assert moved["parent_id"] is None
    assert moved["assignee_id"] == move_ctx["bora"]  # eligible → kept
    # Child detached, relation gone.
    child_after = (await client.get(f"/api/v1/work-packages/{child['id']}")).json()
    assert child_after["parent_id"] is None
    async with app.state.sessionmaker() as session:
        rels = (
            (
                await session.execute(
                    select(WorkPackageRelation).where(
                        (WorkPackageRelation.source_id == uuid.UUID(wp["id"]))
                        | (WorkPackageRelation.target_id == uuid.UUID(wp["id"]))
                    )
                )
            )
            .scalars()
            .all()
        )
        assert rels == []
    # Visibility transfer: comments and time entries went along (readable in
    # the target scope by the caller, an owner of both).
    comments = (await client.get(f"/api/v1/work-packages/{wp['id']}/comments")).json()
    assert comments["total"] == 1
    time = (await client.get(f"/api/v1/work-packages/{wp['id']}/time-entries")).json()
    assert time["total"] == 1


async def test_move_gates_and_validation(app, client, move_ctx, member_project):
    src, dst = move_ctx["src"], move_ctx["dst"]
    wp = await create_wp(client, src, subject="게이트 검사")

    # Same project → 422.
    assert (await _move(client, wp["id"], src)).status_code == 422
    # Target where dev is plain member → allowed target-side, but SOURCE owner
    # required: make a WP in member_project (dev is member, not owner).
    foreign_wp_res = await client.post(
        f"/api/v1/projects/{member_project['project_id']}/work-packages",
        json={"subject": "멤버 소스"},
    )
    assert foreign_wp_res.status_code == 201
    res = await _move(client, foreign_wp_res.json()["id"], dst)
    assert res.status_code == 403  # source owner gate
    # Unknown target → 404 (existence hiding).
    assert (await _move(client, wp["id"], str(uuid.uuid4()))).status_code == 404
    # Version conflict → 409 with current payload.
    res = await _move(client, wp["id"], dst, version=99)
    assert res.status_code == 409
    assert res.json()["current"]["version"] == 0
    # Archived target → 409.
    assert (await client.post(f"/api/v1/projects/{dst}/archive")).status_code == 200
    assert (await _move(client, wp["id"], dst)).status_code == 409


async def test_move_rejects_disabled_type_in_target(client, move_ctx):
    src, dst = move_ctx["src"], move_ctx["dst"]
    wp = await create_wp(client, src, subject="타입 검사", type="bug")
    types = (await client.get(f"/api/v1/projects/{dst}/types")).json()["items"]
    bug = next(t for t in types if t["key"] == "bug")
    res = await client.patch(f"/api/v1/projects/{dst}/types/{bug['id']}", json={"is_active": False})
    assert res.status_code == 200, res.text
    assert (await _move(client, wp["id"], dst)).status_code == 422


async def test_move_updates_attachment_and_notification_project(app, client, move_ctx):
    src, dst = move_ctx["src"], move_ctx["dst"]
    wp = await create_wp(client, src, subject="첨부 이동")
    res = await client.post(
        f"/api/v1/projects/{src}/attachments/upload?filename=a.bin&work_package_id={wp['id']}",
        content=b"x" * 64,
        headers={"content-type": "application/octet-stream"},
    )
    assert res.status_code == 201, res.text
    att_id = res.json()["id"]
    async with app.state.sessionmaker() as session, session.begin():
        session.add(
            Notification(
                user_id=uuid.UUID(move_ctx["bora"]),
                actor_id=None,
                project_id=uuid.UUID(src),
                work_package_id=uuid.UUID(wp["id"]),
                kind="assigned",
            )
        )

    assert (await _move(client, wp["id"], dst)).status_code == 200
    async with app.state.sessionmaker() as session:
        att = (
            await session.execute(select(Attachment).where(Attachment.id == uuid.UUID(att_id)))
        ).scalar_one()
        assert str(att.project_id) == dst
        # Blob key is immutable — quota/sweep follow DB project_id (R1-⑥).
        assert att.storage_key is not None and str(uuid.UUID(src)) in att.storage_key
        note = (
            await session.execute(
                select(Notification).where(Notification.work_package_id == uuid.UUID(wp["id"]))
            )
        ).scalar_one()
        assert str(note.project_id) == dst  # deep link follows the move (R1-⑤)


async def test_move_respects_target_quota(app, client, move_ctx):
    """A move that would blow the target's storage quota is refused (413)."""
    src, dst = move_ctx["src"], move_ctx["dst"]
    wp = await create_wp(client, src, subject="쿼터 검사")
    res = await client.post(
        f"/api/v1/projects/{src}/attachments/upload?filename=big.bin&work_package_id={wp['id']}",
        content=b"x" * 1024,
        headers={"content-type": "application/octet-stream"},
    )
    assert res.status_code == 201
    # Shrink the target quota below the moving payload via settings override.
    app.state.settings.project_storage_quota_bytes = 512
    try:
        res = await _move(client, wp["id"], dst)
        assert res.status_code == 413
    finally:
        app.state.settings.project_storage_quota_bytes = 1024 * 1024 * 1024


async def test_source_only_member_loses_read_after_move(app, client, move_ctx):
    """Visibility transfer regression (v66.1 R1-①): after the move a source-
    only member gets 404 on the WP — acting as Alex via a direct role check
    is impossible (single dev auth), so verify via membership predicate."""
    from app.core.authz import is_member

    src, dst = move_ctx["src"], move_ctx["dst"]
    wp = await create_wp(client, src, subject="가시성 이관")
    assert (await _move(client, wp["id"], dst)).status_code == 200
    async with app.state.sessionmaker() as session:
        row = (
            await session.execute(
                select(WorkPackage.project_id).where(WorkPackage.id == uuid.UUID(wp["id"]))
            )
        ).scalar_one()
        assert str(row) == dst
        assert not await is_member(session, row, uuid.UUID(move_ctx["alex"]))
