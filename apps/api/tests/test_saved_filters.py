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
    assert body["params"] == {"status": "todo", "priority": "urgent", "type": "bug", "q": None}

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
