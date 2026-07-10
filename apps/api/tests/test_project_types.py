"""Per-project work-item type configuration (expansion PLAN Pass 7 PR-R).

Contract: fixed keys + per-project label/order/enablement; disabled types
block NEW usage only (create, or a PATCH that actually changes the type);
no-rows fallback = all enabled; at least one type stays active (racing
deactivations serialized); CSV import rows with disabled types are isolated."""

import asyncio

import pytest

from tests.conftest import create_project, create_wp


async def get_types(client, pid) -> list[dict]:
    res = await client.get(f"/api/v1/projects/{pid}/types")
    assert res.status_code == 200, res.text
    return res.json()["items"]


async def set_active(client, pid, type_id, active: bool):
    return await client.patch(f"/api/v1/projects/{pid}/types/{type_id}", json={"is_active": active})


@pytest.fixture
async def project(client):
    return await create_project(client, key="TYP", name="타입 프로젝트")


async def test_seeded_defaults_and_rename_reorder(client, project):
    pid = project["id"]
    types = await get_types(client, pid)
    assert [t["key"] for t in types] == ["task", "bug", "feature", "milestone"]
    assert all(t["is_active"] for t in types)

    bug = next(t for t in types if t["key"] == "bug")
    res = await client.patch(f"/api/v1/projects/{pid}/types/{bug['id']}", json={"name": "결함"})
    assert res.status_code == 200
    assert res.json()["name"] == "결함"

    # Atomic reorder: reversed order round-trips.
    reversed_ids = [t["id"] for t in reversed(types)]
    res = await client.put(
        f"/api/v1/projects/{pid}/types/order", json={"ordered_ids": reversed_ids}
    )
    assert res.status_code == 200
    assert [t["key"] for t in res.json()["items"]] == ["milestone", "feature", "bug", "task"]


async def test_disabled_type_blocks_new_usage_only(client, project):
    pid = project["id"]
    existing = await create_wp(client, pid, subject="기존 버그", type="bug")
    types = await get_types(client, pid)
    bug = next(t for t in types if t["key"] == "bug")
    assert (await set_active(client, pid, bug["id"], False)).status_code == 200

    # New create with the disabled type → 422.
    res = await client.post(
        f"/api/v1/projects/{pid}/work-packages", json={"subject": "새 버그", "type": "bug"}
    )
    assert res.status_code == 422

    # A REAL type change to the disabled type → 422.
    other = await create_wp(client, pid, subject="작업", type="task")
    res = await client.patch(
        f"/api/v1/work-packages/{other['id']}", json={"expected_version": 0, "type": "bug"}
    )
    assert res.status_code == 422

    # Echoing the CURRENT (disabled) type back while editing another field → OK.
    res = await client.patch(
        f"/api/v1/work-packages/{existing['id']}",
        json={"expected_version": 0, "type": "bug", "priority": "high"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["priority"] == "high"

    # Re-enable → creates work again.
    assert (await set_active(client, pid, bug["id"], True)).status_code == 200
    res = await client.post(
        f"/api/v1/projects/{pid}/work-packages", json={"subject": "복귀 버그", "type": "bug"}
    )
    assert res.status_code == 201


async def test_last_active_type_is_protected_even_racing(client, project):
    pid = project["id"]
    types = await get_types(client, pid)
    # Disable all but two sequentially.
    for t in types[:2]:
        assert (await set_active(client, pid, t["id"], False)).status_code == 200
    remaining = [t for t in types[2:]]

    # Race the last two deactivations: exactly one succeeds.
    r1, r2 = await asyncio.gather(
        set_active(client, pid, remaining[0]["id"], False),
        set_active(client, pid, remaining[1]["id"], False),
    )
    assert sorted([r1.status_code, r2.status_code]) == [200, 409]
    actives = [t for t in await get_types(client, pid) if t["is_active"]]
    assert len(actives) == 1


async def test_csv_import_isolates_disabled_type_rows(client, project):
    pid = project["id"]
    types = await get_types(client, pid)
    bug = next(t for t in types if t["key"] == "bug")
    await set_active(client, pid, bug["id"], False)

    csv_content = "subject,type\n정상 행,task\n격리 행,bug\n"
    res = await client.post(
        f"/api/v1/projects/{pid}/work-packages/import",
        json={"content": csv_content, "dry_run": False},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["valid"] == 1
    assert body["invalid"] == 1
    assert any("bug" in e["message"] or "disabled" in e["message"] for e in body["errors"])


async def test_permissions_and_no_rows_fallback(client, app, member_project, foreign_project):
    shared = str(member_project["project_id"])
    # Fixture projects are inserted directly (no API seed) → NO type rows:
    # the rolling-deploy fallback treats every type as enabled.
    assert await get_types(client, shared) == []
    res = await client.post(
        f"/api/v1/projects/{shared}/work-packages", json={"subject": "폴백 생성", "type": "bug"}
    )
    assert res.status_code == 201  # no rows = all types enabled

    # Owner-only management: insert a real row, then the dev MEMBER gets 403.
    from app.models import ProjectType

    async with app.state.sessionmaker() as session, session.begin():
        row = ProjectType(
            project_id=member_project["project_id"], key="task", name="작업", position=0
        )
        session.add(row)
        await session.flush()
        type_id = str(row.id)
    res = await client.patch(
        f"/api/v1/projects/{shared}/types/{type_id}", json={"name": "멤버 시도"}
    )
    assert res.status_code == 403
    foreign = str(foreign_project["project_id"])
    assert (await client.get(f"/api/v1/projects/{foreign}/types")).status_code == 404
