"""Cross-project work-package search (PLAN §3 Phase 2)."""

import pytest

from tests.conftest import create_project, create_wp


@pytest.fixture
async def two_projects(client):
    a = await create_project(client, key="ALPHA", name="알파")
    b = await create_project(client, key="BETA", name="베타")
    await create_wp(client, a["id"], subject="로그인 화면 버그")
    await create_wp(client, a["id"], subject="대시보드 개선")
    await create_wp(client, b["id"], subject="로그인 토큰 갱신")
    return {"a": a, "b": b}


async def test_search_spans_member_projects(client, two_projects):
    res = await client.get("/api/v1/search/work-packages?q=로그인")
    assert res.status_code == 200
    body = res.json()
    assert body["query"] == "로그인"
    assert body["total"] == 2
    subjects = {i["subject"] for i in body["items"]}
    assert subjects == {"로그인 화면 버그", "로그인 토큰 갱신"}
    # each result carries its project identity for display
    keys = {i["project_key"] for i in body["items"]}
    assert keys == {"ALPHA", "BETA"}


async def test_search_is_case_insensitive_and_scoped(client, two_projects):
    res = await client.get("/api/v1/search/work-packages?q=대시보드")
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["project_name"] == "알파"
    assert body["items"][0]["assignee_name"] is None
    assert body["items"][0]["updated_at"] is not None


async def test_search_excludes_non_member_projects(client, foreign_project):
    # a stranger's project holds a WP subject 'ghost'; the dev user is not a member
    res = await client.get("/api/v1/search/work-packages?q=남의")
    assert res.status_code == 200
    assert res.json()["total"] == 0


async def test_search_without_query_lists_all_member_work(client, two_projects):
    res = await client.get("/api/v1/search/work-packages")
    assert res.status_code == 200
    body = res.json()
    assert body["query"] == ""
    assert body["total"] == 3
    assert {i["project_key"] for i in body["items"]} == {"ALPHA", "BETA"}


async def test_search_empty_query_is_still_rejected(client):
    # q omitted powers the all-work grid; explicit empty q stays invalid.
    assert (await client.get("/api/v1/search/work-packages?q=")).status_code == 422


async def test_search_paginates_with_actual_total(client, two_projects):
    res = await client.get("/api/v1/search/work-packages?limit=1&offset=1")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 3
    assert len(body["items"]) == 1


async def test_search_wildcards_are_escaped(client, two_projects):
    # '%' is a literal, not a LIKE wildcard → no accidental match-all (§6.1)
    res = await client.get("/api/v1/search/work-packages?q=%25")
    assert res.json()["total"] == 0
