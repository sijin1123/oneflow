"""Per-user saved filters (PLAN §3 Phase 2 저장 필터)."""

import pytest

from tests.conftest import create_project


@pytest.fixture
async def project(client):
    return await create_project(client, key="SF", name="저장필터")


async def test_saved_filter_crud(client, project):
    pid = project["id"]
    created = await client.post(
        f"/api/v1/projects/{pid}/saved-filters",
        json={
            "name": "  긴급 버그  ",
            "params": {"status": "todo", "priority": "urgent", "type": "bug"},
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "긴급 버그"  # trimmed
    assert body["params"] == {
        "status": "todo",
        "priority": "urgent",
        "type": "bug",
        "assignee_id": None,
        "milestone_id": None,
        "customer_id": None,
        "cycle_id": None,
        "module_id": None,
        "q": None,
        "columns": None,
        "cf_field": None,
        "cf_op": None,
        "cf_value": None,
    }

    listed = (await client.get(f"/api/v1/projects/{pid}/saved-filters")).json()
    assert listed["total"] == 1

    assert (
        await client.delete(f"/api/v1/projects/{pid}/saved-filters/{body['id']}")
    ).status_code == 204
    assert (await client.get(f"/api/v1/projects/{pid}/saved-filters")).json()["total"] == 0


async def test_duplicate_name_conflicts(client, project):
    pid = project["id"]
    payload = {"name": "내 필터", "params": {"q": "로그인"}}
    assert (
        await client.post(f"/api/v1/projects/{pid}/saved-filters", json=payload)
    ).status_code == 201
    dup = await client.post(f"/api/v1/projects/{pid}/saved-filters", json=payload)
    assert dup.status_code == 409


async def test_invalid_enum_param_rejected(client, project):
    pid = project["id"]
    res = await client.post(
        f"/api/v1/projects/{pid}/saved-filters",
        json={"name": "bad", "params": {"status": "not_a_status"}},
    )
    assert res.status_code == 422


async def test_saved_filters_are_member_scoped(client, foreign_project):
    pid = foreign_project["project_id"]
    # non-member → 404 (existence hiding)
    assert (await client.get(f"/api/v1/projects/{pid}/saved-filters")).status_code == 404
    assert (
        await client.post(f"/api/v1/projects/{pid}/saved-filters", json={"name": "x", "params": {}})
    ).status_code == 404


async def test_delete_missing_filter_404(client, project):
    pid = project["id"]
    missing = "00000000-0000-4000-8000-000000000000"
    assert (
        await client.delete(f"/api/v1/projects/{pid}/saved-filters/{missing}")
    ).status_code == 404


async def test_saved_filters_are_per_user_within_a_shared_project(app, client, project):
    """A member cannot see or delete another member's saved filters in the same
    project (fable5 audit: cross-user saved-filter isolation was untested)."""
    from sqlalchemy import select

    from app.models import ProjectMember, SavedFilter, User

    pid = project["id"]
    async with app.state.sessionmaker() as session, session.begin():
        other = User(email="mallory@oneflow.local", display_name="Mallory")
        session.add(other)
        await session.flush()
        session.add(ProjectMember(project_id=pid, user_id=other.id, role="member"))
        session.add(SavedFilter(project_id=pid, user_id=other.id, name="남의 필터", params={}))
        await session.flush()
        others_filter_id = (
            await session.execute(select(SavedFilter.id).where(SavedFilter.user_id == other.id))
        ).scalar_one()

    # dev (the acting user) is also a member but must not see other's filter…
    listed = (await client.get(f"/api/v1/projects/{pid}/saved-filters")).json()
    assert all(f["name"] != "남의 필터" for f in listed["items"])
    # …nor delete it (existence hiding → 404, never someone else's row).
    assert (
        await client.delete(f"/api/v1/projects/{pid}/saved-filters/{others_filter_id}")
    ).status_code == 404
