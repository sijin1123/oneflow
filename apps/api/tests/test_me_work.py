"""Personal home /me/work (expansion PLAN Pass 1 PR-B).

Covers the validator-required contract: membership evaluated at query time
(revocation hides data immediately), non-member projects never leak, the
shared completion policy excludes closed items, due-soon boundaries, and the
hard list caps."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, select

from app.core.auth import DEV_USER_EMAIL
from app.core.dates import utc_today
from app.models import Project, ProjectMember, User, WorkPackage, WpWatcher
from tests.conftest import create_project, create_wp


async def _me_work(client) -> dict:
    res = await client.get("/api/v1/me/work")
    assert res.status_code == 200, res.text
    return res.json()


async def _dev_id(client) -> str:
    res = await client.get("/api/v1/me")
    return res.json()["id"]


async def _work_items(client, **params) -> dict:
    res = await client.get("/api/v1/me/work-items", params=params)
    assert res.status_code == 200, res.text
    return res.json()


async def _activities(client, **params) -> dict:
    res = await client.get("/api/v1/me/activities", params=params)
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture
async def home(client):
    """One member project with a mix of assigned/unassigned/closed items."""
    me = await _dev_id(client)
    project = await create_project(client, key="HOME", name="홈 프로젝트")
    today = utc_today()  # the endpoint's boundary is UTC (Pass 46)
    wps = {
        "due_tomorrow": await create_wp(
            client,
            project["id"],
            subject="내일 마감",
            assignee_id=me,
            due_date=str(today + timedelta(days=1)),
        ),
        "due_late": await create_wp(
            client,
            project["id"],
            subject="다음 달 마감",
            assignee_id=me,
            due_date=str(today + timedelta(days=30)),
        ),
        "no_due": await create_wp(client, project["id"], subject="기한 없음", assignee_id=me),
        "done": await create_wp(
            client, project["id"], subject="이미 완료", assignee_id=me, status="done"
        ),
        "cancelled": await create_wp(
            client, project["id"], subject="취소됨", assignee_id=me, status="cancelled"
        ),
        "unassigned": await create_wp(client, project["id"], subject="남의 일"),
    }
    return {"project": project, "me": me, "wps": wps, "today": today}


async def test_assigned_lists_open_items_ordered_by_due_date(client, home):
    body = await _me_work(client)
    subjects = [i["subject"] for i in body["assigned_to_me"]]
    # closed statuses and unassigned items are excluded; nulls sort last
    assert subjects == ["내일 마감", "다음 달 마감", "기한 없음"]
    first = body["assigned_to_me"][0]
    assert first["project_name"] == "홈 프로젝트"
    assert first["project_id"] == home["project"]["id"]


async def test_due_soon_boundaries(client, home):
    me = home["me"]
    project_id = home["project"]["id"]
    today = home["today"]
    await create_wp(client, project_id, subject="오늘 마감", assignee_id=me, due_date=str(today))
    await create_wp(
        client,
        project_id,
        subject="7일째 마감",
        assignee_id=me,
        due_date=str(today + timedelta(days=7)),
    )
    await create_wp(
        client,
        project_id,
        subject="8일째 마감",
        assignee_id=me,
        due_date=str(today + timedelta(days=8)),
    )
    await create_wp(
        client,
        project_id,
        subject="어제 마감",
        assignee_id=me,
        due_date=str(today - timedelta(days=1)),
    )

    body = await _me_work(client)
    due_soon = {i["subject"] for i in body["due_soon"]}
    # inclusive window [today, today+7]; overdue/later/null-due items excluded
    assert due_soon == {"오늘 마감", "내일 마감", "7일째 마감"}


async def test_non_member_project_never_leaks(client, app, foreign_project):
    """Even a WP assigned to me is hidden while I am not a project member."""
    me = await _dev_id(client)
    async with app.state.sessionmaker() as session, session.begin():
        wp = (
            await session.execute(
                select(WorkPackage).where(WorkPackage.id == foreign_project["wp_id"])
            )
        ).scalar_one()
        wp.assignee_id = me

    body = await _me_work(client)
    assert body["assigned_to_me"] == []
    assert body["due_soon"] == []
    assert all(
        a["project_id"] != str(foreign_project["project_id"]) for a in body["recent_activity"]
    )


async def test_membership_revocation_hides_everything_immediately(client, app, member_project):
    me = member_project["dev_id"]
    project_id = member_project["project_id"]
    async with app.state.sessionmaker() as session, session.begin():
        wp = WorkPackage(project_id=project_id, subject="공유 작업", assignee_id=me)
        session.add(wp)

    # visible while a member (creating via the API would also record activity;
    # this WP was inserted directly, so only the assignment list matters here)
    body = await _me_work(client)
    assert [i["subject"] for i in body["assigned_to_me"]] == ["공유 작업"]

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            delete(ProjectMember).where(
                ProjectMember.project_id == project_id, ProjectMember.user_id == me
            )
        )

    body = await _me_work(client)
    assert body["assigned_to_me"] == []
    assert body["due_soon"] == []
    assert body["recent_activity"] == []


async def test_recent_activity_spans_member_projects_newest_first(client, home):
    other = await create_project(client, key="TWO", name="두번째")
    await create_wp(client, other["id"], subject="다른 프로젝트 작업")

    body = await _me_work(client)
    acts = body["recent_activity"]
    assert len(acts) > 0
    # newest first: the most recent event is the second project's creation
    assert acts[0]["project_name"] == "두번째"
    assert acts[0]["work_package_subject"] == "다른 프로젝트 작업"
    assert acts[0]["action"] == "created"
    # both member projects appear
    assert {a["project_name"] for a in acts} >= {"홈 프로젝트", "두번째"}


async def test_hard_limits_cap_the_lists(client, app):
    me = await _dev_id(client)
    await create_project(client, key="BULK", name="대량")
    async with app.state.sessionmaker() as session, session.begin():
        dev = (await session.execute(select(User).where(User.email == DEV_USER_EMAIL))).scalar_one()
        assert str(dev.id) == me
        pid = (await session.execute(select(Project.id).where(Project.key == "BULK"))).scalar_one()
        for n in range(55):
            session.add(WorkPackage(project_id=pid, subject=f"작업 {n:02d}", assignee_id=dev.id))

    body = await _me_work(client)
    assert len(body["assigned_to_me"]) == 50
    assert len(body["recent_activity"]) <= 20


async def test_created_by_me_delegation_view(client, app, member_project):
    """Pass 45 PR-BK (v45.1): open items I created that are NOT mine to do —
    unassigned included (explicit IS NULL), my own assignments excluded,
    closed/archived/non-member excluded; assignee is server-enriched."""

    from tests.conftest import create_project, create_wp

    project = await create_project(client, key="CBM", name="위임 추적")
    pid = project["id"]
    me = (await client.get("/api/v1/me")).json()

    await create_wp(client, pid, subject="미배정 위임")
    to_other = await create_wp(client, pid, subject="타인 위임")
    # Assign to another member (add one first).
    other = (
        await client.post(
            "/api/v1/users", json={"email": "delegate@corp.com", "display_name": "위임 대상"}
        )
    ).json()
    await client.post(
        f"/api/v1/projects/{pid}/members", json={"email": "delegate@corp.com", "role": "member"}
    )
    await client.patch(
        f"/api/v1/work-packages/{to_other['id']}",
        json={"expected_version": 0, "assignee_id": other["id"]},
    )
    # My own assignment — excluded from created_by_me (it's in assigned_to_me).
    mine = await create_wp(client, pid, subject="내 담당")
    await client.patch(
        f"/api/v1/work-packages/{mine['id']}", json={"expected_version": 0, "assignee_id": me["id"]}
    )
    # Closed — excluded.
    closed = await create_wp(client, pid, subject="종결됨")
    await client.patch(
        f"/api/v1/work-packages/{closed['id']}", json={"expected_version": 0, "status": "done"}
    )

    body = (await client.get("/api/v1/me/work")).json()
    created = {w["subject"]: w for w in body["created_by_me"]}
    assert set(created) >= {"미배정 위임", "타인 위임"}
    assert "내 담당" not in created and "종결됨" not in created
    assert created["미배정 위임"]["assignee_id"] is None
    assert created["타인 위임"]["assignee_name"] == "위임 대상"  # server-enriched
    assert {w["subject"] for w in body["assigned_to_me"]} >= {"내 담당"}

    # Archived project drops out entirely.
    await client.post(f"/api/v1/projects/{pid}/archive")
    body = (await client.get("/api/v1/me/work")).json()
    assert all(w["project_id"] != pid for w in body["created_by_me"])


async def test_work_items_relationships_state_and_created_own_assignment(
    client, app, member_project
):
    """The tab relationships intentionally differ from legacy /me/work delegation."""
    project_id = member_project["project_id"]
    me = member_project["dev_id"]
    other = member_project["owner_id"]
    async with app.state.sessionmaker() as session, session.begin():
        assigned = WorkPackage(
            project_id=project_id, subject="담당 전용", assignee_id=me, created_by=other
        )
        created = WorkPackage(
            project_id=project_id, subject="생성 전용", assignee_id=other, created_by=me
        )
        own = WorkPackage(
            project_id=project_id, subject="내가 만들고 담당", assignee_id=me, created_by=me
        )
        closed = WorkPackage(
            project_id=project_id, subject="종결 생성", created_by=me, status="done"
        )
        subscribed = WorkPackage(project_id=project_id, subject="구독 전용", created_by=other)
        session.add_all([assigned, created, own, closed, subscribed])
        await session.flush()
        session.add(WpWatcher(work_package_id=subscribed.id, user_id=me))

    assigned = await _work_items(client, relationship="assigned")
    assert {item["subject"] for item in assigned["items"]} == {
        "담당 전용",
        "내가 만들고 담당",
    }
    created_open = await _work_items(client, relationship="created")
    assert {item["subject"] for item in created_open["items"]} == {
        "생성 전용",
        "내가 만들고 담당",
    }
    subscribed_open = await _work_items(client, relationship="subscribed")
    assert {item["subject"] for item in subscribed_open["items"]} == {"구독 전용"}
    created_all = await _work_items(client, relationship="created", state="all")
    assert {item["subject"] for item in created_all["items"]} == {
        "생성 전용",
        "내가 만들고 담당",
        "종결 생성",
    }


async def test_work_items_literal_search_sort_and_pagination(client, app, member_project):
    project_id = member_project["project_id"]
    me = member_project["dev_id"]
    today = utc_today()
    stamp = datetime(2026, 1, 1, tzinfo=UTC)
    async with app.state.sessionmaker() as session, session.begin():
        session.add_all(
            [
                WorkPackage(
                    project_id=project_id,
                    subject="100%_literal",
                    created_by=me,
                    due_date=today,
                    updated_at=stamp,
                ),
                WorkPackage(
                    project_id=project_id,
                    subject="나중 기한",
                    created_by=me,
                    due_date=today + timedelta(days=2),
                    updated_at=stamp + timedelta(seconds=2),
                ),
                WorkPackage(
                    project_id=project_id,
                    subject="기한 없음",
                    created_by=me,
                    updated_at=stamp + timedelta(seconds=1),
                ),
            ]
        )

    literal = await _work_items(client, relationship="created", q="%_")
    assert literal["total"] == 1
    assert [item["subject"] for item in literal["items"]] == ["100%_literal"]
    updated = await _work_items(client, relationship="created", sort="updated")
    assert [item["subject"] for item in updated["items"]] == [
        "나중 기한",
        "기한 없음",
        "100%_literal",
    ]
    page = await _work_items(client, relationship="created", sort="due", limit=1, offset=1)
    assert (page["total"], page["limit"], page["offset"]) == (3, 1, 1)
    assert [item["subject"] for item in page["items"]] == ["나중 기한"]


async def test_work_item_tabs_hide_on_revocation_and_archive_then_restore(
    client, app, member_project
):
    project_id = member_project["project_id"]
    me = member_project["dev_id"]
    async with app.state.sessionmaker() as session, session.begin():
        watched = WorkPackage(project_id=project_id, subject="가시성 구독")
        assigned = WorkPackage(project_id=project_id, subject="가시성 배정", assignee_id=me)
        created = WorkPackage(project_id=project_id, subject="가시성 생성", created_by=me)
        session.add_all([watched, assigned, created])
        await session.flush()
        session.add(WpWatcher(work_package_id=watched.id, user_id=me))

    async def assert_visibility(expected: int) -> None:
        for relationship, query in (
            ("assigned", "가시성 배정"),
            ("created", "가시성 생성"),
            ("subscribed", "가시성 구독"),
        ):
            result = await _work_items(client, relationship=relationship, q=query)
            assert result["total"] == expected

    await assert_visibility(1)
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            delete(ProjectMember).where(
                ProjectMember.project_id == project_id, ProjectMember.user_id == me
            )
        )
    await assert_visibility(0)
    async with app.state.sessionmaker() as session, session.begin():
        session.add(ProjectMember(project_id=project_id, user_id=me, role="member"))
    await assert_visibility(1)
    async with app.state.sessionmaker() as session, session.begin():
        project = (
            await session.execute(select(Project).where(Project.id == project_id))
        ).scalar_one()
        project.archived_at = datetime.now(UTC)
    await assert_visibility(0)


async def test_activities_paginate_search_and_follow_membership_visibility(client, app):
    first = await create_project(client, key="ACTONE", name="활동 검색 프로젝트")
    second = await create_project(client, key="ACTTWO", name="다른 활동 프로젝트")
    await create_wp(client, first["id"], subject="첫 활동")
    await create_wp(client, second["id"], subject="둘 활동")
    me = await _dev_id(client)

    page = await _activities(client, limit=1, offset=1)
    assert (page["total"], page["limit"], page["offset"], len(page["items"])) == (2, 1, 1, 1)
    matched = await _activities(client, q="활동 검색 프로젝트")
    assert [item["work_package_subject"] for item in matched["items"]] == ["첫 활동"]
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            delete(ProjectMember).where(
                ProjectMember.project_id == first["id"], ProjectMember.user_id == me
            )
        )
    assert (await _activities(client, q="활동 검색 프로젝트"))["total"] == 0
    async with app.state.sessionmaker() as session, session.begin():
        session.add(ProjectMember(project_id=first["id"], user_id=me, role="owner"))
        project = (
            await session.execute(select(Project).where(Project.id == second["id"]))
        ).scalar_one()
        project.archived_at = datetime.now(UTC)
    visible = await _activities(client)
    assert [item["work_package_subject"] for item in visible["items"]] == ["첫 활동"]


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/me/work-items?relationship=invalid",
        "/api/v1/me/work-items?relationship=assigned&state=invalid",
        "/api/v1/me/work-items?relationship=assigned&sort=invalid",
        "/api/v1/me/work-items?relationship=assigned&limit=0",
        "/api/v1/me/work-items?relationship=assigned&limit=101",
        "/api/v1/me/activities?limit=0",
        "/api/v1/me/activities?limit=101",
    ],
)
async def test_my_tab_query_validation_returns_422(client, path):
    assert (await client.get(path)).status_code == 422


async def test_my_time_entries(client, app, member_project):
    """Pass 53 PR-BS (v53.1): user_id is the only ownership filter (entries
    survive leaving a project — audit data); date-only UTC inclusive on
    spent_on; totals cover the whole range; WP deletion cascades entries
    away (existing contract)."""
    from datetime import timedelta as td

    from sqlalchemy import text as sa_text

    from app.core.dates import utc_today
    from tests.conftest import create_project, create_wp

    project = await create_project(client, key="MYTM", name="내 시간")
    pid = project["id"]
    wp = await create_wp(client, pid, subject="시간 기록 대상")
    today = utc_today()

    for offset, hours in ((0, 2.0), (3, 1.5), (8, 4.0)):  # 8 is outside the 7-day default
        res = await client.post(
            f"/api/v1/work-packages/{wp['id']}/time-entries",
            json={
                "hours": hours,
                "spent_on": str(today - __import__("datetime").timedelta(days=offset)),
            },
        )
        assert res.status_code == 201, res.text

    res = await client.get("/api/v1/me/time-entries")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 2 and body["total_hours"] == 3.5  # default window
    assert body["by_project"][0]["project_name"] == "내 시간"

    # Explicit pair widens the window; one-sided is ambiguous (422).
    wide = (
        await client.get(f"/api/v1/me/time-entries?from={today - td(days=30)}&to={today}")
    ).json()
    assert wide["total"] == 3 and wide["total_hours"] == 7.5
    assert (await client.get(f"/api/v1/me/time-entries?from={today}")).status_code == 422
    assert (
        await client.get(f"/api/v1/me/time-entries?from={today}&to={today - td(days=1)}")
    ).status_code == 422
    assert (
        await client.get(f"/api/v1/me/time-entries?from={today - td(days=200)}&to={today}")
    ).status_code == 422

    # Another user's entries never appear (ownership filter).
    other_project = str(member_project["project_id"])
    other_wp = await create_wp(client, other_project, subject="남의 기록용")
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            sa_text(
                "INSERT INTO time_entries (id, work_package_id, user_id, hours, spent_on) "
                "VALUES (gen_random_uuid(), CAST(:wp AS uuid), CAST(:u AS uuid), 9,"
                " CAST(:d AS date))"
            ).bindparams(wp=other_wp["id"], u=str(member_project["owner_id"]), d=str(today))
        )
    body = (await client.get("/api/v1/me/time-entries")).json()
    assert body["total_hours"] == 3.5  # the owner's 9h never bleeds in

    # Leaving the project keeps MY records visible (v53.1 R1-① re-ruling).
    me = (await client.get("/api/v1/me")).json()
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            sa_text(
                "DELETE FROM project_members WHERE project_id = CAST(:p AS uuid) "
                "AND user_id = CAST(:u AS uuid)"
            ).bindparams(p=pid, u=me["id"])
        )
    body = (await client.get("/api/v1/me/time-entries")).json()
    assert body["total_hours"] == 3.5  # still mine after leaving

    # WP deletion cascades my entries away (existing contract, made explicit).
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            sa_text("DELETE FROM work_packages WHERE id = CAST(:id AS uuid)").bindparams(
                id=wp["id"]
            )
        )
    body = (await client.get("/api/v1/me/time-entries")).json()
    assert body["total_hours"] == 0.0
