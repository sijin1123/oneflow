"""Work package contract: CRU, filters, optimistic concurrency, parent guards (§13)."""

import asyncio
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db.integrity import detect_parent_cycles
from app.models import User
from tests.conftest import create_project, create_wp


@pytest.fixture
async def project(client):
    return await create_project(client, key="WPT", name="WP 테스트")


async def test_cru_roundtrip(client, project):
    wp = await create_wp(client, project["id"], subject="첫 작업", priority="high")
    assert wp["version"] == 0
    got = await client.get(f"/api/v1/work-packages/{wp['id']}")
    assert got.status_code == 200 and got.json()["subject"] == "첫 작업"
    patched = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "status": "todo"},
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "todo"
    assert patched.json()["version"] == 1  # token bumped on write


async def test_list_filters_and_envelope(client, project):
    await create_wp(client, project["id"], subject="버그 하나", type="bug", status="todo")
    await create_wp(client, project["id"], subject="기능 하나", type="feature", priority="high")
    res = await client.get(
        f"/api/v1/projects/{project['id']}/work-packages", params={"type": "bug"}
    )
    body = res.json()
    assert body["total"] == 1 and body["items"][0]["type"] == "bug"
    # invalid enum value → 422, never a silent empty result (§6.1)
    bad = await client.get(
        f"/api/v1/projects/{project['id']}/work-packages", params={"status": "weird"}
    )
    assert bad.status_code == 422


async def test_search_ilike_and_autoescape(client, project):
    await create_wp(client, project["id"], subject="100% 완료 보고")
    await create_wp(client, project["id"], subject="100x 완료 보고")
    res = await client.get(f"/api/v1/projects/{project['id']}/work-packages", params={"q": "100%"})
    subjects = [i["subject"] for i in res.json()["items"]]
    assert subjects == ["100% 완료 보고"]  # % treated literally (autoescape)
    upper = await client.get(
        f"/api/v1/projects/{project['id']}/work-packages", params={"q": "100X"}
    )
    assert [i["subject"] for i in upper.json()["items"]] == ["100x 완료 보고"]  # case-insensitive


async def test_patch_stale_version_409_with_current(client, project):
    wp = await create_wp(client, project["id"])
    ok = await client.patch(
        f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 0, "status": "todo"}
    )
    assert ok.status_code == 200
    stale = await client.patch(
        f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 0, "status": "done"}
    )
    assert stale.status_code == 409
    body = stale.json()
    assert isinstance(body["detail"], str)
    assert body["current"]["version"] == 1  # ConflictResponse carries fresh resource


async def test_concurrent_patch_exactly_one_wins(client, project):
    wp = await create_wp(client, project["id"])
    r1, r2 = await asyncio.gather(
        client.patch(
            f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 0, "status": "todo"}
        ),
        client.patch(
            f"/api/v1/work-packages/{wp['id']}",
            json={"expected_version": 0, "status": "in_progress"},
        ),
    )
    assert sorted([r1.status_code, r2.status_code]) == [200, 409]
    # The loser's 409 `current` must carry the WINNER's committed row, not the
    # loser's pre-race identity-map snapshot (review finding #1).
    winner, loser = (r1, r2) if r1.status_code == 200 else (r2, r1)
    conflict = loser.json()["current"]
    assert conflict["version"] == 1
    assert conflict["status"] == winner.json()["status"]


async def test_expected_version_int4_bounds(client, project):
    wp = await create_wp(client, project["id"])
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 2_147_483_648, "status": "todo"},
    )
    assert res.status_code == 422  # out-of-int4-range token is a client error, not a 500


async def test_empty_body_no_bump(client, project):
    wp = await create_wp(client, project["id"])
    before = await client.get(f"/api/v1/work-packages/{wp['id']}")
    res = await client.patch(f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 0})
    assert res.status_code == 200
    after = res.json()
    assert after["version"] == 0  # no write → no bump (§6.2)
    assert after["updated_at"] == before.json()["updated_at"]
    stale = await client.patch(f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 9})
    assert stale.status_code == 409


async def test_null_semantics(client, project, dev_user):
    wp = await create_wp(client, project["id"], assignee_id=str(dev_user.id), description="설명")
    cleared = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "assignee_id": None},
    )
    assert cleared.status_code == 200
    body = cleared.json()
    assert body["assignee_id"] is None  # explicit null clears
    assert body["description"] == "설명"  # omitted field unchanged
    bad = await client.patch(
        f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 1, "subject": None}
    )
    assert bad.status_code == 422  # non-nullable field rejects null


async def test_assignee_must_be_member(app, client, project):
    async with app.state.sessionmaker() as session, session.begin():
        outsider = User(email="outsider@oneflow.local", display_name="Outsider")
        session.add(outsider)
        await session.flush()
        outsider_id = outsider.id
    res = await client.post(
        f"/api/v1/projects/{project['id']}/work-packages",
        json={"subject": "x", "assignee_id": str(outsider_id)},
    )
    assert res.status_code == 422


async def test_date_rules(client, project):
    bad = await client.post(
        f"/api/v1/projects/{project['id']}/work-packages",
        json={"subject": "x", "start_date": "2026-07-10", "due_date": "2026-07-01"},
    )
    assert bad.status_code == 422
    same_day = await create_wp(
        client, project["id"], subject="같은 날", start_date="2026-07-10", due_date="2026-07-10"
    )
    assert same_day["start_date"] == "2026-07-10"  # date-only round-trip, no tz shift
    wp = await create_wp(client, project["id"], subject="역전 패치", start_date="2026-07-01")
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "due_date": "2026-06-30"},
    )
    assert res.status_code == 422  # effective combination start > due


async def test_parent_guards_sequential(client, project, foreign_project):
    a = await create_wp(client, project["id"], subject="A")
    b = await create_wp(client, project["id"], subject="B")
    self_ref = await client.patch(
        f"/api/v1/work-packages/{a['id']}",
        json={"expected_version": 0, "parent_id": a["id"]},
    )
    assert self_ref.status_code == 422
    cross = await client.patch(
        f"/api/v1/work-packages/{a['id']}",
        json={"expected_version": 0, "parent_id": str(foreign_project["wp_id"])},
    )
    assert cross.status_code == 422
    ok = await client.patch(
        f"/api/v1/work-packages/{a['id']}",
        json={"expected_version": 0, "parent_id": b["id"]},
    )
    assert ok.status_code == 200
    cycle = await client.patch(
        f"/api/v1/work-packages/{b['id']}",
        json={"expected_version": 0, "parent_id": a["id"]},
    )
    assert cycle.status_code == 422  # A→B exists; B→A would close a cycle


async def test_cross_project_parent_rejected_at_db(app, project, foreign_project):
    # Direct INSERT bypassing the app: composite FK must refuse (§7).
    async with app.state.sessionmaker() as session:
        with pytest.raises(IntegrityError):
            async with session.begin():
                await session.execute(
                    text(
                        "INSERT INTO work_packages "
                        "(id, project_id, subject, type, status, priority, version) "
                        "VALUES (CAST(:id AS uuid), CAST(:pid AS uuid), "
                        "'evil', 'task', 'backlog', 'none', 0)"
                    ).bindparams(id=str(uuid.uuid4()), pid=project["id"])
                )
                # parent in ANOTHER project → (parent_id, project_id) has no match
                await session.execute(
                    text(
                        "UPDATE work_packages SET parent_id = CAST(:parent AS uuid) "
                        "WHERE project_id = CAST(:pid AS uuid)"
                    ).bindparams(parent=str(foreign_project["wp_id"]), pid=project["id"])
                )


async def test_concurrent_parent_change_no_cycle_2node(app, client, project):
    a = await create_wp(client, project["id"], subject="A")
    b = await create_wp(client, project["id"], subject="B")
    r1, r2 = await asyncio.gather(
        client.patch(
            f"/api/v1/work-packages/{a['id']}",
            json={"expected_version": 0, "parent_id": b["id"]},
        ),
        client.patch(
            f"/api/v1/work-packages/{b['id']}",
            json={"expected_version": 0, "parent_id": a["id"]},
        ),
    )
    assert sorted([r1.status_code, r2.status_code]) == [200, 422]  # advisory lock serializes
    async with app.state.sessionmaker() as session:
        assert await detect_parent_cycles(session) == []


async def test_concurrent_parent_change_no_cycle_3node(app, client, project):
    a = await create_wp(client, project["id"], subject="A")
    b = await create_wp(client, project["id"], subject="B")
    c = await create_wp(client, project["id"], subject="C")
    results = await asyncio.gather(
        client.patch(
            f"/api/v1/work-packages/{a['id']}",
            json={"expected_version": 0, "parent_id": b["id"]},
        ),
        client.patch(
            f"/api/v1/work-packages/{b['id']}",
            json={"expected_version": 0, "parent_id": c["id"]},
        ),
        client.patch(
            f"/api/v1/work-packages/{c['id']}",
            json={"expected_version": 0, "parent_id": a["id"]},
        ),
    )
    codes = sorted(r.status_code for r in results)
    assert codes.count(422) >= 1  # only the cycle-closing request(s) fail
    assert all(code in (200, 422) for code in codes)
    async with app.state.sessionmaker() as session:
        assert await detect_parent_cycles(session) == []


async def test_detect_cycles_catches_raw_sql_injection(app, client, project):
    # Cycles cannot be created through the API; simulate an out-of-band writer (v5.1).
    a = await create_wp(client, project["id"], subject="A")
    b = await create_wp(client, project["id"], subject="B")
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text(
                "UPDATE work_packages SET parent_id = CAST(:p AS uuid) WHERE id = CAST(:i AS uuid)"
            ).bindparams(p=b["id"], i=a["id"])
        )
        await session.execute(
            text(
                "UPDATE work_packages SET parent_id = CAST(:p AS uuid) WHERE id = CAST(:i AS uuid)"
            ).bindparams(p=a["id"], i=b["id"])
        )
    async with app.state.sessionmaker() as session:
        cycles = await detect_parent_cycles(session)
    assert len(cycles) >= 1  # pre-import integrity check would flag this


async def test_nonmember_wp_hidden(client, foreign_project):
    res = await client.get(f"/api/v1/work-packages/{foreign_project['wp_id']}")
    assert res.status_code == 404
    patched = await client.patch(
        f"/api/v1/work-packages/{foreign_project['wp_id']}",
        json={"expected_version": 0, "status": "done"},
    )
    assert patched.status_code == 404
    listed = await client.get(f"/api/v1/projects/{foreign_project['project_id']}/work-packages")
    assert listed.status_code == 404
