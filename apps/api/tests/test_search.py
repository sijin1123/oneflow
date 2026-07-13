"""Cross-project work-package search (PLAN §3 Phase 2)."""

import uuid

import pytest
from sqlalchemy import select

from app.core.auth import DEV_USER_EMAIL
from app.models import User, WorkPackage, WpWatcher
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


async def test_search_excludes_non_member_projects_from_every_scope(client, app, foreign_project):
    # Make the foreign row match every personal relationship. Membership must
    # still be the outer existence-hiding boundary for each workspace scope.
    async with app.state.sessionmaker() as session, session.begin():
        dev = (await session.execute(select(User).where(User.email == DEV_USER_EMAIL))).scalar_one()
        work_package = (
            await session.execute(
                select(WorkPackage).where(WorkPackage.id == foreign_project["wp_id"])
            )
        ).scalar_one()
        work_package.assignee_id = dev.id
        work_package.created_by = dev.id
        session.add(WpWatcher(work_package_id=work_package.id, user_id=dev.id))

    for scope in ("all", "assigned", "created", "subscribed"):
        res = await client.get("/api/v1/search/work-packages", params={"q": "남의", "scope": scope})
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


async def test_workspace_view_scope_filters_sort_and_pagination(client, app, two_projects):
    me = (await client.get("/api/v1/me")).json()["id"]
    assigned_late = await create_wp(
        client,
        two_projects["a"]["id"],
        subject="범위 배정 늦음",
        assignee_id=me,
        priority="urgent",
        due_date="2026-08-20",
    )
    assigned_early = await create_wp(
        client,
        two_projects["a"]["id"],
        subject="범위 배정 빠름",
        assignee_id=me,
        due_date="2026-08-01",
    )
    await create_wp(
        client,
        two_projects["a"]["id"],
        subject="범위 배정 완료",
        assignee_id=me,
        status="done",
    )
    subscribed = await create_wp(
        client,
        two_projects["b"]["id"],
        subject="범위 구독",
    )
    async with app.state.sessionmaker() as session, session.begin():
        another_creator = User(email="workspace-view-other@example.com", display_name="Other")
        session.add(another_creator)
        await session.flush()
        session.add(
            WorkPackage(
                project_id=uuid.UUID(two_projects["b"]["id"]),
                subject="범위 타인 작성",
                created_by=another_creator.id,
            )
        )
        session.add(
            WpWatcher(
                work_package_id=uuid.UUID(subscribed["id"]),
                user_id=uuid.UUID(me),
            )
        )

    assigned = await client.get(
        "/api/v1/search/work-packages",
        params={"scope": "assigned", "state": "open", "sort": "due", "q": "범위 배정"},
    )
    assert assigned.status_code == 200, assigned.text
    assert [item["id"] for item in assigned.json()["items"]] == [
        assigned_early["id"],
        assigned_late["id"],
    ]

    completed = await client.get(
        "/api/v1/search/work-packages",
        params={"scope": "assigned", "state": "all", "q": "범위 배정"},
    )
    assert completed.json()["total"] == 3

    urgent = await client.get(
        "/api/v1/search/work-packages",
        params={"scope": "created", "priority": "urgent", "q": "범위"},
    )
    assert [item["id"] for item in urgent.json()["items"]] == [assigned_late["id"]]

    other_created = await client.get(
        "/api/v1/search/work-packages",
        params={"scope": "created", "q": "범위 타인 작성"},
    )
    assert other_created.json()["total"] == 0
    visible_to_all = await client.get(
        "/api/v1/search/work-packages",
        params={"scope": "all", "q": "범위 타인 작성"},
    )
    assert visible_to_all.json()["total"] == 1

    watched = await client.get(
        "/api/v1/search/work-packages",
        params={"scope": "subscribed", "q": "범위"},
    )
    assert [item["id"] for item in watched.json()["items"]] == [subscribed["id"]]

    page = await client.get(
        "/api/v1/search/work-packages",
        params={"scope": "assigned", "state": "all", "q": "범위 배정", "limit": 1, "offset": 1},
    )
    assert page.json()["total"] == 3
    assert len(page.json()["items"]) == 1


@pytest.mark.parametrize(
    "query",
    ["scope=unknown", "state=unknown", "sort=unknown", "priority=unknown"],
)
async def test_workspace_view_rejects_unknown_controls(client, query):
    assert (await client.get(f"/api/v1/search/work-packages?{query}")).status_code == 422
