"""Personal home /me/work (expansion PLAN Pass 1 PR-B).

Covers the validator-required contract: membership evaluated at query time
(revocation hides data immediately), non-member projects never leak, the
shared completion policy excludes closed items, due-soon boundaries, and the
hard list caps."""

from datetime import timedelta

import pytest
from sqlalchemy import delete, select

from app.core.auth import DEV_USER_EMAIL
from app.core.dates import utc_today
from app.models import Project, ProjectMember, User, WorkPackage
from tests.conftest import create_project, create_wp


async def _me_work(client) -> dict:
    res = await client.get("/api/v1/me/work")
    assert res.status_code == 200, res.text
    return res.json()


async def _dev_id(client) -> str:
    res = await client.get("/api/v1/me")
    return res.json()["id"]


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
