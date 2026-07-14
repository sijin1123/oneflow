"""Cross-project work-package search (PLAN §3 Phase 2)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, update

from app.core.auth import DEV_USER_EMAIL
from app.core.dates import utc_today
from app.models import ProjectMember, User, WorkPackage, WpWatcher
from app.services.workspace_pql import BooleanExpression, PqlError, parse_pql
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


async def test_workspace_search_exposes_version_and_role_write_capability(client, app):
    project = await create_project(client, key="EDIT", name="편집 권한")
    work_package = await create_wp(client, project["id"], subject="셀 편집 대상")

    response = await client.get(
        "/api/v1/search/work-packages",
        params={"q": "셀 편집 대상"},
    )
    assert response.status_code == 200, response.text
    item = response.json()["items"][0]
    assert item["version"] == work_package["version"]
    assert item["current_user_can_write"] is True

    user_id = uuid.UUID((await client.get("/api/v1/me")).json()["id"])
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            update(ProjectMember)
            .where(ProjectMember.project_id == uuid.UUID(project["id"]))
            .where(ProjectMember.user_id == user_id)
            .values(role="viewer")
        )

    response = await client.get(
        "/api/v1/search/work-packages",
        params={"q": "셀 편집 대상"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["items"][0]["current_user_can_write"] is False


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


def test_workspace_pql_grammar_precedence_operators_order_and_limit():
    parsed = parse_pql(
        "state = open OR priority NOT IN (low, none) AND assignee = me "
        "ORDER BY updated DESC LIMIT 20"
    )
    assert isinstance(parsed.expression, BooleanExpression)
    assert parsed.expression.operator == "OR"
    assert parsed.order_by == "updated"
    assert parsed.direction == "DESC"
    assert parsed.limit == 20
    assert parsed.normalized.endswith("ORDER BY updated DESC LIMIT 20")


@pytest.mark.parametrize(
    "query",
    ["state = unknown", "priority IN ()", "state = open LIMIT 0", "title ="],
)
def test_workspace_pql_rejects_invalid_syntax_and_values(query):
    with pytest.raises(PqlError):
        parse_pql(query)


def test_workspace_pql_bounds_list_and_predicate_complexity():
    with pytest.raises(PqlError, match="at most 25 values"):
        parse_pql(f"title IN ({', '.join(f'item-{index}' for index in range(26))})")
    with pytest.raises(PqlError, match="at most 20 predicates"):
        parse_pql(" AND ".join(f"title = item-{index}" for index in range(21)))


async def test_workspace_pql_execution_validation_and_member_boundary(
    client, two_projects, foreign_project
):
    me = (await client.get("/api/v1/me")).json()
    await create_wp(client, two_projects["a"]["id"], subject="PQL mine", assignee_id=me["id"])
    await create_wp(client, two_projects["b"]["id"], subject="PQL done", status="done")

    query = "state = open AND assignee = me ORDER BY title ASC LIMIT 1"
    validated = await client.post(
        "/api/v1/search/work-packages/pql/validate", json={"query": query}
    )
    assert validated.status_code == 200, validated.text
    assert validated.json() == {
        "normalized": query,
        "fields": ["state", "assignee"],
        "order_by": "title",
        "direction": "ASC",
        "limit": 1,
    }
    result = await client.get("/api/v1/search/work-packages", params={"pql": query, "limit": 99})
    assert result.status_code == 200, result.text
    assert result.json()["total"] == 1
    assert [item["subject"] for item in result.json()["items"]] == ["PQL mine"]
    outside_limit = await client.get(
        "/api/v1/search/work-packages",
        params={"pql": "state = open LIMIT 1", "limit": 50, "offset": 1},
    )
    assert outside_limit.json()["total"] == 1
    assert outside_limit.json()["items"] == []

    ordered = []
    for priority in ("none", "high", "urgent", "low", "medium"):
        ordered.append(
            await create_wp(
                client,
                two_projects["a"]["id"],
                subject=f"PQL priority {priority}",
                priority=priority,
            )
        )
    titles = ", ".join(f"'PQL priority {item['priority']}'" for item in ordered)
    ranked = await client.get(
        "/api/v1/search/work-packages",
        params={"pql": f"title IN ({titles}) ORDER BY priority ASC"},
    )
    assert [item["priority"] for item in ranked.json()["items"]] == [
        "urgent",
        "high",
        "medium",
        "low",
        "none",
    ]

    hidden = await client.get(
        "/api/v1/search/work-packages",
        params={"pql": "title = '남의 작업'"},
    )
    assert hidden.status_code == 200
    assert hidden.json()["total"] == 0
    assert (
        await client.post(
            "/api/v1/search/work-packages/pql/validate", json={"query": "project = SECRET"}
        )
    ).status_code == 422


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


async def test_workspace_analytics_aggregates_full_filtered_result(client, two_projects):
    today = utc_today()
    project_a = two_projects["a"]
    project_b = two_projects["b"]
    cases = (
        (project_a, "분석 대기", "backlog", "none", None),
        (project_a, "분석 지연", "todo", "low", today - timedelta(days=1)),
        (project_a, "분석 임박", "in_progress", "high", today),
        (project_a, "분석 이후", "in_review", "urgent", today + timedelta(days=8)),
        (project_b, "분석 완료", "done", "medium", today - timedelta(days=5)),
        (project_b, "분석 취소", "cancelled", "medium", None),
    )
    for project, subject, status, priority, due_date in cases:
        await create_wp(
            client,
            project["id"],
            subject=subject,
            status=status,
            priority=priority,
            due_date=due_date.isoformat() if due_date else None,
        )

    response = await client.get("/api/v1/search/work-packages/analytics", params={"q": "분석"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 6
    assert {item["key"]: item["count"] for item in body["status_buckets"]} == {
        "backlog": 1,
        "todo": 1,
        "in_progress": 1,
        "in_review": 1,
        "done": 1,
        "cancelled": 1,
    }
    assert {item["key"]: item["count"] for item in body["priority_buckets"]} == {
        "none": 1,
        "low": 1,
        "medium": 2,
        "high": 1,
        "urgent": 1,
    }
    assert [(item["key"], item["count"]) for item in body["top_projects"]] == [
        ("ALPHA", 4),
        ("BETA", 2),
    ]
    assert body["project_overflow"] == {"project_count": 0, "item_count": 0}
    assert body["schedule_buckets"] == {
        "completed": 2,
        "open_overdue": 1,
        "open_due_next_7_days": 1,
        "open_later": 1,
        "open_unscheduled": 1,
    }
    assert sum(body["schedule_buckets"].values()) == body["total"]


async def test_workspace_analytics_bounds_project_buckets_with_explicit_overflow(client):
    expected_keys = []
    for index in range(11):
        key = f"AX{index:02d}"
        expected_keys.append(key)
        project = await create_project(client, key=key, name=f"분석 프로젝트 {index:02d}")
        await create_wp(client, project["id"], subject="프로젝트 초과 분석")

    response = await client.get(
        "/api/v1/search/work-packages/analytics", params={"q": "프로젝트 초과 분석"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 11
    assert [project["key"] for project in body["top_projects"]] == expected_keys[:10]
    assert body["project_overflow"] == {"project_count": 1, "item_count": 1}


async def test_workspace_analytics_matches_scope_basic_and_pql_limit(client, app, two_projects):
    me = (await client.get("/api/v1/me")).json()["id"]
    await create_wp(
        client,
        two_projects["a"]["id"],
        subject="분석 범위 A",
        assignee_id=me,
        priority="high",
    )
    await create_wp(
        client,
        two_projects["a"]["id"],
        subject="분석 범위 B",
        assignee_id=me,
        priority="high",
        status="done",
    )
    subscribed = await create_wp(
        client,
        two_projects["b"]["id"],
        subject="분석 범위 C",
        priority="medium",
    )
    async with app.state.sessionmaker() as session, session.begin():
        session.add(WpWatcher(work_package_id=uuid.UUID(subscribed["id"]), user_id=uuid.UUID(me)))

    scoped = await client.get(
        "/api/v1/search/work-packages/analytics",
        params={
            "q": "분석 범위",
            "scope": "assigned",
            "state": "open",
            "priority": "high",
        },
    )
    assert scoped.status_code == 200, scoped.text
    assert scoped.json()["total"] == 1
    assert scoped.json()["top_projects"][0]["count"] == 1

    watched = await client.get(
        "/api/v1/search/work-packages/analytics",
        params={"q": "분석 범위", "scope": "subscribed"},
    )
    assert watched.status_code == 200, watched.text
    assert watched.json()["total"] == 1
    assert watched.json()["priority_buckets"][2] == {"key": "medium", "count": 1}

    pql = await client.get(
        "/api/v1/search/work-packages/analytics",
        params={
            "q": "분석 범위",
            "pql": "priority IN (high, medium) ORDER BY title ASC LIMIT 2",
        },
    )
    assert pql.status_code == 200, pql.text
    assert pql.json()["total"] == 2
    assert sum(item["count"] for item in pql.json()["status_buckets"]) == 2
    assert pql.json()["top_projects"] == [
        {
            "id": two_projects["a"]["id"],
            "key": "ALPHA",
            "name": "알파",
            "count": 2,
        }
    ]
    invalid = await client.get(
        "/api/v1/search/work-packages/analytics",
        params={"pql": "priority = impossible"},
    )
    assert invalid.status_code == 422


async def test_workspace_analytics_hides_non_member_projects(client, app, foreign_project):
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
        response = await client.get(
            "/api/v1/search/work-packages/analytics",
            params={"q": "남의", "scope": scope},
        )
        assert response.status_code == 200, response.text
        assert response.json()["total"] == 0
        assert response.json()["top_projects"] == []


async def test_workspace_view_column_sorts_full_authorized_result(client, app, two_projects):
    project_id = two_projects["a"]["id"]
    status_items = {
        status: await create_wp(
            client,
            project_id,
            subject=f"상태 열 정렬 {status}",
            status=status,
        )
        for status in ("backlog", "cancelled", "done", "in_progress", "in_review", "todo")
    }
    for sort, expected in (
        ("status_asc", sorted(status_items)),
        ("status_desc", sorted(status_items, reverse=True)),
    ):
        response = await client.get(
            "/api/v1/search/work-packages",
            params={"q": "상태 열 정렬", "sort": sort},
        )
        assert response.status_code == 200, response.text
        assert [item["id"] for item in response.json()["items"]] == [
            status_items[status]["id"] for status in expected
        ]

    priority_items = {
        priority: await create_wp(
            client,
            project_id,
            subject=f"우선 열 정렬 {priority}",
            priority=priority,
        )
        for priority in ("none", "low", "medium", "high", "urgent")
    }
    semantic_order = ["none", "low", "medium", "high", "urgent"]
    for sort, expected in (
        ("priority_asc", semantic_order),
        ("priority_desc", list(reversed(semantic_order))),
    ):
        response = await client.get(
            "/api/v1/search/work-packages",
            params={"q": "우선 열 정렬", "sort": sort},
        )
        assert response.status_code == 200, response.text
        assert [item["id"] for item in response.json()["items"]] == [
            priority_items[priority]["id"] for priority in expected
        ]

    tied_items = [
        await create_wp(
            client,
            project_id,
            subject=f"우선 열 동률 {index}",
            priority="low",
        )
        for index in range(3)
    ]
    tied_ids = [uuid.UUID(item["id"]) for item in tied_items]
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            update(WorkPackage)
            .where(WorkPackage.id.in_(tied_ids))
            .values(updated_at=datetime(2026, 7, 13, 0, 0, tzinfo=UTC))
        )
    paged_ids = []
    for offset in range(3):
        response = await client.get(
            "/api/v1/search/work-packages",
            params={
                "q": "우선 열 동률",
                "sort": "priority_asc",
                "limit": 1,
                "offset": offset,
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["total"] == 3
        paged_ids.append(response.json()["items"][0]["id"])
    assert paged_ids == sorted(item["id"] for item in tied_items)


@pytest.mark.parametrize(
    "query",
    ["scope=unknown", "state=unknown", "sort=unknown", "priority=unknown"],
)
async def test_workspace_view_rejects_unknown_controls(client, query):
    assert (await client.get(f"/api/v1/search/work-packages?{query}")).status_code == 422
