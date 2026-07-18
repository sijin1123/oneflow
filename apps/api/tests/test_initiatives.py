"""Cross-project initiatives (expansion PLAN Pass 3 PR-L).

Contract: creator-only mutations; visibility = creator OR member of a
connected project; roll-ups aggregate ONLY the caller's member projects
(no cross-project leakage beyond the connection count)."""

import asyncio
import uuid

from sqlalchemy import func, select, update

from app.models import (
    Initiative,
    InitiativeProject,
    InitiativeSubscriber,
    InitiativeWorkPackage,
    Notification,
    Project,
    ProjectMember,
    User,
    UserNotificationSettings,
    WorkPackage,
)
from tests.conftest import create_project, create_wp


async def create_initiative(client, name="플랫폼 개편", **extra) -> dict:
    res = await client.post("/api/v1/initiatives", json={"name": name, **extra})
    assert res.status_code == 201, res.text
    return res.json()


async def connect(client, initiative_id, project_id):
    return await client.post(
        f"/api/v1/initiatives/{initiative_id}/projects", json={"project_id": project_id}
    )


async def test_create_connect_and_rollup(client, project_factory=None):
    a = await create_project(client, key="INIA", name="이니셔티브 A")
    b = await create_project(client, key="INIB", name="이니셔티브 B")
    await create_wp(client, a["id"], subject="A-1")
    await create_wp(client, a["id"], subject="A-2 완료", status="done")
    await create_wp(client, b["id"], subject="B-1")

    ini = await create_initiative(client)
    assert ini["is_mine"] is True
    assert ini["connected_project_count"] == 0

    assert (await connect(client, ini["id"], a["id"])).status_code == 200
    res = await connect(client, ini["id"], b["id"])
    assert res.status_code == 200
    body = res.json()
    assert body["connected_project_count"] == 2
    rollup = {p["project_name"]: p for p in body["projects"]}
    assert rollup["이니셔티브 A"]["work_package_count"] == 2
    assert rollup["이니셔티브 A"]["done_work_package_count"] == 1
    assert rollup["이니셔티브 B"]["work_package_count"] == 1

    # Duplicate connection → 409; disconnect works.
    assert (await connect(client, ini["id"], a["id"])).status_code == 409
    res = await client.delete(f"/api/v1/initiatives/{ini['id']}/projects/{a['id']}")
    assert res.status_code == 200
    assert res.json()["connected_project_count"] == 1


async def test_initiative_label_taxonomy_assignment_filter_and_admin_guard(client, app, dev_user):
    assert (await client.get("/api/v1/initiatives/labels")).json() == {
        "items": [],
        "total": 0,
    }
    strategic = await client.post(
        "/api/v1/initiatives/labels",
        json={"name": "  Strategic   Bets ", "color": "#6D5DFB"},
    )
    assert strategic.status_code == 201, strategic.text
    strategic_label = strategic.json()
    assert strategic_label["name"] == "Strategic Bets"
    assert strategic_label["color"] == "#6d5dfb"
    assert (
        await client.post(
            "/api/v1/initiatives/labels",
            json={"name": "strategic bets", "color": "#111111"},
        )
    ).status_code == 409

    operations = (
        await client.post(
            "/api/v1/initiatives/labels",
            json={"name": "Operations", "color": "#0f766e"},
        )
    ).json()
    initiative = await create_initiative(client, name="라벨 전략")
    assigned = await client.put(
        f"/api/v1/initiatives/{initiative['id']}/labels",
        json={"label_ids": [strategic_label["id"], operations["id"]]},
    )
    assert assigned.status_code == 200, assigned.text
    assert [label["name"] for label in assigned.json()["labels"]] == [
        "Operations",
        "Strategic Bets",
    ]
    filtered = await client.get("/api/v1/initiatives", params={"label_id": strategic_label["id"]})
    assert [item["id"] for item in filtered.json()["items"]] == [initiative["id"]]
    assert (await client.get("/api/v1/initiatives", params={"label_id": str(uuid.uuid4())})).json()[
        "total"
    ] == 0

    unknown = await client.put(
        f"/api/v1/initiatives/{initiative['id']}/labels",
        json={"label_ids": [str(uuid.uuid4())]},
    )
    assert unknown.status_code == 422
    duplicate = await client.put(
        f"/api/v1/initiatives/{initiative['id']}/labels",
        json={"label_ids": [strategic_label["id"], strategic_label["id"]]},
    )
    assert duplicate.status_code == 422

    renamed = await client.patch(
        f"/api/v1/initiatives/labels/{operations['id']}",
        json={"name": "Operational", "color": "#2563eb"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Operational"
    assert (
        await client.delete(f"/api/v1/initiatives/labels/{strategic_label['id']}")
    ).status_code == 204
    remaining = (await client.get("/api/v1/initiatives")).json()["items"][0]["labels"]
    assert [label["name"] for label in remaining] == ["Operational"]

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(update(User).where(User.id == dev_user.id).values(is_admin=False))
    denied = await client.post(
        "/api/v1/initiatives/labels",
        json={"name": "Denied", "color": "#334155"},
    )
    assert denied.status_code == 403


async def test_work_item_scope_candidates_connect_disconnect_and_project_cleanup(client, app):
    first = await create_project(client, key="INIW", name="전략 프로젝트")
    second = await create_project(client, key="INIX", name="확장 프로젝트")
    unrelated = await create_project(client, key="INIU", name="비연결 프로젝트")
    first_wp = await create_wp(client, first["id"], subject="인증 전환")
    second_wp = await create_wp(client, second["id"], subject="검색 개편", status="done")
    unrelated_wp = await create_wp(client, unrelated["id"], subject="범위 밖 작업")
    ini = await create_initiative(client, name="전략 범위")
    assert (await connect(client, ini["id"], first["id"])).status_code == 200
    assert (await connect(client, ini["id"], second["id"])).status_code == 200

    candidates = await client.get(f"/api/v1/initiatives/{ini['id']}/work-item-candidates")
    assert candidates.status_code == 200, candidates.text
    assert candidates.json()["total"] == 2
    assert {row["subject"] for row in candidates.json()["items"]} == {
        "인증 전환",
        "검색 개편",
    }
    searched = await client.get(
        f"/api/v1/initiatives/{ini['id']}/work-item-candidates", params={"q": "검색"}
    )
    assert [row["id"] for row in searched.json()["items"]] == [second_wp["id"]]

    linked = await client.post(
        f"/api/v1/initiatives/{ini['id']}/work-items",
        json={"work_package_id": first_wp["id"]},
    )
    assert linked.status_code == 201, linked.text
    assert linked.json()["project_name"] == "전략 프로젝트"
    assert (
        await client.post(
            f"/api/v1/initiatives/{ini['id']}/work-items",
            json={"work_package_id": first_wp["id"]},
        )
    ).status_code == 409
    assert (
        await client.post(
            f"/api/v1/initiatives/{ini['id']}/work-items",
            json={"work_package_id": unrelated_wp["id"]},
        )
    ).status_code == 404

    scope = await client.get(f"/api/v1/initiatives/{ini['id']}/work-items")
    assert scope.status_code == 200
    assert (scope.json()["total"], scope.json()["connected_work_item_count"]) == (1, 1)
    assert scope.json()["items"][0]["id"] == first_wp["id"]
    listed = next(
        row
        for row in (await client.get("/api/v1/initiatives")).json()["items"]
        if row["id"] == ini["id"]
    )
    assert listed["connected_work_item_count"] == 1

    disconnected = await client.delete(f"/api/v1/initiatives/{ini['id']}/projects/{first['id']}")
    assert disconnected.status_code == 200
    assert disconnected.json()["connected_work_item_count"] == 0
    async with app.state.sessionmaker() as session:
        links = (
            (
                await session.execute(
                    select(InitiativeWorkPackage).where(
                        InitiativeWorkPackage.initiative_id == ini["id"]
                    )
                )
            )
            .scalars()
            .all()
        )
        assert links == []


async def test_work_item_scope_hides_foreign_rows_and_is_owner_write_only(
    client, app, member_project
):
    async with app.state.sessionmaker() as session, session.begin():
        private = Project(key="INIP", name="비공개 전략 프로젝트")
        session.add(private)
        await session.flush()
        shared_wp = WorkPackage(project_id=member_project["project_id"], subject="공유 전략 작업")
        private_wp = WorkPackage(project_id=private.id, subject="비공개 전략 작업")
        session.add_all([shared_wp, private_wp])
        await session.flush()
        ini = Initiative(name="멤버 전략", owner_id=member_project["owner_id"])
        session.add(ini)
        await session.flush()
        session.add_all(
            [
                InitiativeProject(initiative_id=ini.id, project_id=member_project["project_id"]),
                InitiativeProject(initiative_id=ini.id, project_id=private.id),
            ]
        )
        await session.flush()
        session.add_all(
            [
                InitiativeWorkPackage(
                    initiative_id=ini.id,
                    project_id=member_project["project_id"],
                    work_package_id=shared_wp.id,
                ),
                InitiativeWorkPackage(
                    initiative_id=ini.id,
                    project_id=private.id,
                    work_package_id=private_wp.id,
                ),
            ]
        )
        ini_id = str(ini.id)
        shared_wp_id = str(shared_wp.id)
        private_wp_id = str(private_wp.id)

    listed = next(
        row
        for row in (await client.get("/api/v1/initiatives")).json()["items"]
        if row["id"] == ini_id
    )
    assert listed["connected_work_item_count"] == 2
    scope = await client.get(f"/api/v1/initiatives/{ini_id}/work-items")
    assert scope.status_code == 200
    assert (scope.json()["total"], scope.json()["connected_work_item_count"]) == (1, 2)
    assert [row["subject"] for row in scope.json()["items"]] == ["공유 전략 작업"]
    assert "비공개 전략 작업" not in scope.text

    assert (
        await client.get(f"/api/v1/initiatives/{ini_id}/work-item-candidates")
    ).status_code == 404
    assert (
        await client.post(
            f"/api/v1/initiatives/{ini_id}/work-items",
            json={"work_package_id": shared_wp_id},
        )
    ).status_code == 404
    assert (
        await client.delete(f"/api/v1/initiatives/{ini_id}/work-items/{private_wp_id}")
    ).status_code == 404


async def test_state_and_date_validation(client):
    res = await client.post("/api/v1/initiatives", json={"name": "이상", "state": "wat"})
    assert res.status_code == 422
    res = await client.post(
        "/api/v1/initiatives",
        json={"name": "역전", "start_date": "2026-09-01", "target_date": "2026-08-01"},
    )
    assert res.status_code == 422

    ini = await create_initiative(client, name="상태 전이")
    res = await client.patch(f"/api/v1/initiatives/{ini['id']}", json={"state": "in_progress"})
    assert res.status_code == 200
    assert res.json()["state"] == "in_progress"


async def test_subscription_is_self_service_idempotent_and_reflected_in_list(client):
    ini = await create_initiative(client, name="구독 전략")

    first = await client.post(f"/api/v1/initiatives/{ini['id']}/subscription")
    assert first.status_code == 200
    assert first.json() == {"is_following": True, "follower_count": 1}
    second = await client.post(f"/api/v1/initiatives/{ini['id']}/subscription")
    assert second.status_code == 200
    assert second.json() == first.json()

    listed = (await client.get("/api/v1/initiatives")).json()["items"][0]
    assert (listed["is_following"], listed["follower_count"]) == (True, 1)

    removed = await client.delete(f"/api/v1/initiatives/{ini['id']}/subscription")
    assert removed.status_code == 200
    assert removed.json() == {"is_following": False, "follower_count": 0}
    again = await client.delete(f"/api/v1/initiatives/{ini['id']}/subscription")
    assert again.status_code == 200
    assert again.json() == removed.json()


async def test_initiative_events_recheck_visibility_activity_and_preference(client, app):
    project = await create_project(client, key="ININ", name="알림 전략 프로젝트")
    wp = await create_wp(client, project["id"], subject="알림 전략 작업")
    ini = await create_initiative(client, name="알림 전략")
    assert (await connect(client, ini["id"], project["id"])).status_code == 200

    async with app.state.sessionmaker() as session, session.begin():
        eligible = User(email="eligible@oneflow.local", display_name="Eligible", is_active=True)
        muted = User(email="muted@oneflow.local", display_name="Muted", is_active=True)
        revoked = User(email="revoked@oneflow.local", display_name="Revoked", is_active=True)
        inactive = User(email="inactive@oneflow.local", display_name="Inactive", is_active=False)
        session.add_all([eligible, muted, revoked, inactive])
        await session.flush()
        project_id = uuid.UUID(project["id"])
        initiative_id = uuid.UUID(ini["id"])
        session.add_all(
            [
                ProjectMember(project_id=project_id, user_id=eligible.id, role="member"),
                ProjectMember(project_id=project_id, user_id=muted.id, role="member"),
                ProjectMember(project_id=project_id, user_id=inactive.id, role="member"),
                *[
                    InitiativeSubscriber(initiative_id=initiative_id, user_id=user.id)
                    for user in (eligible, muted, revoked, inactive)
                ],
            ]
        )
        session.add(UserNotificationSettings(user_id=muted.id, initiatives=False))
        eligible_id = eligible.id

    assert (
        await client.post(
            f"/api/v1/initiatives/{ini['id']}/work-items",
            json={"work_package_id": wp["id"]},
        )
    ).status_code == 201
    assert (
        await client.patch(f"/api/v1/initiatives/{ini['id']}", json={"health": "on_track"})
    ).status_code == 200
    assert (
        await client.patch(f"/api/v1/initiatives/{ini['id']}", json={"state": "in_progress"})
    ).status_code == 200
    assert (
        await client.patch(f"/api/v1/initiatives/{ini['id']}", json={"name": "알림 전략 2"})
    ).status_code == 200
    assert (
        await client.post(
            f"/api/v1/initiatives/{ini['id']}/owner",
            json={"owner_id": str(eligible_id)},
        )
    ).status_code == 200

    async with app.state.sessionmaker() as session:
        rows = (
            (
                await session.execute(
                    select(Notification)
                    .where(Notification.user_id == eligible_id)
                    .order_by(Notification.created_at, Notification.id)
                )
            )
            .scalars()
            .all()
        )
        assert [row.kind for row in rows] == [
            "initiative_scope",
            "initiative_health",
            "initiative_state",
            "initiative_updated",
            "initiative_owner",
        ]
        assert all(row.project_id is None and row.initiative_id is not None for row in rows)
        assert await session.scalar(select(func.count()).select_from(Notification)) == 5


async def test_initiative_notification_inbox_target_and_delete_cascade(client, app):
    ini = await create_initiative(client, name="인박스 전략")
    assert (await client.post(f"/api/v1/initiatives/{ini['id']}/subscription")).status_code == 200
    me = (await client.get("/api/v1/me")).json()
    async with app.state.sessionmaker() as session, session.begin():
        session.add(
            Notification(
                user_id=uuid.UUID(me["id"]),
                initiative_id=uuid.UUID(ini["id"]),
                kind="initiative_state",
            )
        )

    inbox = (await client.get("/api/v1/me/notifications")).json()
    assert inbox["items"][0]["project_id"] is None
    assert inbox["items"][0]["initiative_id"] == ini["id"]
    assert inbox["items"][0]["initiative_name"] == "인박스 전략"

    assert (await client.delete(f"/api/v1/initiatives/{ini['id']}")).status_code == 204
    async with app.state.sessionmaker() as session:
        assert await session.scalar(select(func.count()).select_from(Notification)) == 0
        assert await session.scalar(select(func.count()).select_from(InitiativeSubscriber)) == 0


async def test_inbox_hides_initiative_notification_after_visibility_is_revoked(
    client, app, member_project
):
    me = (await client.get("/api/v1/me")).json()
    me_id = uuid.UUID(me["id"])
    project_id = uuid.UUID(str(member_project["project_id"]))
    owner_id = uuid.UUID(str(member_project["owner_id"]))

    async with app.state.sessionmaker() as session, session.begin():
        initiative = Initiative(name="권한 회수 전략", owner_id=owner_id)
        session.add(initiative)
        await session.flush()
        session.add_all(
            [
                InitiativeProject(initiative_id=initiative.id, project_id=project_id),
                Notification(
                    user_id=me_id,
                    initiative_id=initiative.id,
                    kind="initiative_health",
                ),
            ]
        )

    visible = (await client.get("/api/v1/me/notifications")).json()
    assert visible["unread"] == 1
    assert visible["items"][0]["initiative_name"] == "권한 회수 전략"

    async with app.state.sessionmaker() as session, session.begin():
        membership = (
            await session.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id == me_id,
                )
            )
        ).scalar_one()
        await session.delete(membership)

    hidden = (await client.get("/api/v1/me/notifications")).json()
    assert hidden == {"items": [], "total": 0, "unread": 0}


async def test_notification_target_shape_rejects_mixed_initiative_targets(client, app):
    import pytest
    from sqlalchemy.exc import IntegrityError

    project = await create_project(client, key="INCK", name="알림 제약")
    initiative = await create_initiative(client, name="알림 제약 전략")
    me = (await client.get("/api/v1/me")).json()

    for kind in ("initiative_state", "assigned"):
        with pytest.raises(IntegrityError):
            async with app.state.sessionmaker() as session, session.begin():
                session.add(
                    Notification(
                        user_id=uuid.UUID(me["id"]),
                        project_id=uuid.UUID(project["id"]),
                        initiative_id=uuid.UUID(initiative["id"]),
                        kind=kind,
                    )
                )


async def test_visibility_via_membership_and_leak_guard(client, app, member_project):
    """The OWNER's initiative becomes visible to the dev member once a shared
    project is connected — but the roll-up hides projects the dev cannot see,
    and mutations stay creator-only (404)."""
    owner_id = member_project["owner_id"]
    shared_pid = member_project["project_id"]
    async with app.state.sessionmaker() as session, session.begin():
        # The owner's private project (dev is NOT a member).
        private = Project(key="PRIV", name="비공개 프로젝트")
        session.add(private)
        await session.flush()
        ini = Initiative(name="소유자 이니셔티브", owner_id=owner_id)
        session.add(ini)
        await session.flush()
        session.add(InitiativeProject(initiative_id=ini.id, project_id=private.id))
        ini_id = str(ini.id)

    # Not visible yet: dev is neither creator nor member of a connected project.
    listed = (await client.get("/api/v1/initiatives")).json()
    assert all(i["id"] != ini_id for i in listed["items"])

    # Connect the shared project (direct row — API mutations are creator-only).
    async with app.state.sessionmaker() as session, session.begin():
        session.add(InitiativeProject(initiative_id=ini_id, project_id=shared_pid))

    listed = (await client.get("/api/v1/initiatives")).json()
    row = next(i for i in listed["items"] if i["id"] == ini_id)
    assert row["is_mine"] is False
    assert row["owner_name"] == "Owner"
    # Leak guard: 2 connections, but only the shared project's rollup is shown.
    assert row["connected_project_count"] == 2
    assert [p["project_name"] for p in row["projects"]] == ["공유 프로젝트"]

    # Creator-only mutations: the dev member gets 404 on edit/connect/delete.
    assert (
        await client.patch(f"/api/v1/initiatives/{ini_id}", json={"name": "탈취"})
    ).status_code == 404
    assert (await connect(client, ini_id, str(shared_pid))).status_code == 404
    assert (await client.delete(f"/api/v1/initiatives/{ini_id}")).status_code == 404


async def test_owner_candidates_and_transfer_are_visibility_scoped(client, app):
    shared = await create_project(client, key="INIO", name="소유권 프로젝트")
    shared_second = await create_project(client, key="INI2", name="두 번째 소유권 프로젝트")
    ini = await create_initiative(client, name="소유권 이전")
    assert (await connect(client, ini["id"], shared["id"])).status_code == 200
    assert (await connect(client, ini["id"], shared_second["id"])).status_code == 200
    async with app.state.sessionmaker() as session, session.begin():
        eligible = User(email="eligible@oneflow.local", display_name="Eligible")
        eligible_second = User(email="eligible-second@oneflow.local", display_name="Second")
        inactive = User(email="inactive@oneflow.local", display_name="Inactive", is_active=False)
        foreign = User(email="foreign@oneflow.local", display_name="Foreign")
        foreign_project = Project(key="INIF", name="외부 프로젝트")
        session.add_all([eligible, eligible_second, inactive, foreign, foreign_project])
        await session.flush()
        session.add_all(
            [
                ProjectMember(project_id=shared["id"], user_id=eligible.id, role="member"),
                ProjectMember(
                    project_id=shared_second["id"], user_id=eligible_second.id, role="member"
                ),
                ProjectMember(project_id=shared["id"], user_id=inactive.id, role="member"),
                ProjectMember(project_id=foreign_project.id, user_id=foreign.id, role="owner"),
            ]
        )
        eligible_id = str(eligible.id)
        eligible_second_id = str(eligible_second.id)
        inactive_id = str(inactive.id)
        foreign_id = str(foreign.id)

    candidates = await client.get(f"/api/v1/initiatives/{ini['id']}/owner-candidates")
    assert candidates.status_code == 200
    assert [(row["user_id"], row["display_name"]) for row in candidates.json()["items"]] == [
        (eligible_id, "Eligible"),
        (eligible_second_id, "Second"),
    ]
    for invalid in (inactive_id, foreign_id, ini["owner_id"]):
        rejected = await client.post(
            f"/api/v1/initiatives/{ini['id']}/owner", json={"owner_id": invalid}
        )
        assert rejected.status_code == 422

    transferred = await client.post(
        f"/api/v1/initiatives/{ini['id']}/owner", json={"owner_id": eligible_id}
    )
    assert transferred.status_code == 200, transferred.text
    assert transferred.json()["owner_id"] == eligible_id
    assert transferred.json()["owner_name"] == "Eligible"
    assert transferred.json()["is_mine"] is False
    assert (
        await client.patch(f"/api/v1/initiatives/{ini['id']}", json={"name": "old owner edit"})
    ).status_code == 404


async def test_concurrent_owner_transfer_has_single_winner(client, app):
    project = await create_project(client, key="INIR", name="소유권 경쟁 프로젝트")
    ini = await create_initiative(client, name="소유권 경쟁")
    assert (await connect(client, ini["id"], project["id"])).status_code == 200
    async with app.state.sessionmaker() as session, session.begin():
        first = User(email="first-owner@oneflow.local", display_name="First")
        second = User(email="second-owner@oneflow.local", display_name="Second")
        session.add_all([first, second])
        await session.flush()
        session.add_all(
            [
                ProjectMember(project_id=project["id"], user_id=first.id, role="member"),
                ProjectMember(project_id=project["id"], user_id=second.id, role="member"),
            ]
        )
        first_id = str(first.id)
        second_id = str(second.id)

    first_response, second_response = await asyncio.gather(
        client.post(
            f"/api/v1/initiatives/{ini['id']}/owner",
            json={"owner_id": first_id},
        ),
        client.post(
            f"/api/v1/initiatives/{ini['id']}/owner",
            json={"owner_id": second_id},
        ),
    )
    assert sorted([first_response.status_code, second_response.status_code]) == [200, 404]
    winner = first_response if first_response.status_code == 200 else second_response
    listed = (await client.get("/api/v1/initiatives")).json()
    row = next(item for item in listed["items"] if item["id"] == ini["id"])
    assert row["owner_id"] == winner.json()["owner_id"]


async def test_project_owner_claims_orphan_but_not_active_owner(client, app):
    project = await create_project(client, key="INIC", name="복구 프로젝트")
    ini = await create_initiative(client, name="복구 대상")
    assert (await connect(client, ini["id"], project["id"])).status_code == 200
    assert (await client.post(f"/api/v1/initiatives/{ini['id']}/owner/claim")).status_code == 409

    async with app.state.sessionmaker() as session, session.begin():
        row = (
            await session.execute(select(Initiative).where(Initiative.id == ini["id"]))
        ).scalar_one()
        row.owner_id = None

    listed = (await client.get("/api/v1/initiatives")).json()
    orphan = next(row for row in listed["items"] if row["id"] == ini["id"])
    assert orphan["owner_id"] is None
    assert orphan["can_claim_ownership"] is True
    claimed = await client.post(f"/api/v1/initiatives/{ini['id']}/owner/claim")
    assert claimed.status_code == 200, claimed.text
    assert claimed.json()["owner_id"] == ini["owner_id"]
    assert claimed.json()["is_mine"] is True


async def test_plain_member_cannot_claim_inactive_owner(client, app, member_project):
    async with app.state.sessionmaker() as session, session.begin():
        owner = await session.get(User, member_project["owner_id"])
        owner.is_active = False
        ini = Initiative(name="member cannot claim", owner_id=owner.id)
        session.add(ini)
        await session.flush()
        session.add(
            InitiativeProject(
                initiative_id=ini.id,
                project_id=member_project["project_id"],
            )
        )
        ini_id = str(ini.id)
    row = next(
        item
        for item in (await client.get("/api/v1/initiatives")).json()["items"]
        if item["id"] == ini_id
    )
    assert row["can_claim_ownership"] is False
    assert (await client.post(f"/api/v1/initiatives/{ini_id}/owner/claim")).status_code == 404


async def test_connect_requires_project_membership(client, foreign_project):
    ini = await create_initiative(client, name="멤버십 검증")
    res = await connect(client, ini["id"], str(foreign_project["project_id"]))
    assert res.status_code == 404  # existence hiding, same as every guard


async def test_delete_cascades_connections_not_projects(client, app):
    p = await create_project(client, key="INID", name="삭제 검증")
    ini = await create_initiative(client, name="삭제 대상")
    assert (await connect(client, ini["id"], p["id"])).status_code == 200

    assert (await client.delete(f"/api/v1/initiatives/{ini['id']}")).status_code == 204
    async with app.state.sessionmaker() as session:
        links = (await session.execute(select(InitiativeProject))).scalars().all()
        assert links == []
        project_alive = (
            await session.execute(select(Project).where(Project.key == "INID"))
        ).scalar_one_or_none()
        assert project_alive is not None


async def test_health_report_mirrors_project_contract(client, app):
    """Pass 44 PR-BJ (v44.1): the v37.1 transition table via the shared pure
    helper; creator-only like every initiative edit; id-only updated_by;
    last-write-wins (snapshot-only — the always-replaced note can't linger)."""
    import asyncio

    from sqlalchemy import text

    ini = await create_initiative(client, name="헬스 이니셔티브")
    me = (await client.get("/api/v1/me")).json()

    # Set with note → stamped; setting WITHOUT a note replaces it with null.
    res = await client.patch(
        f"/api/v1/initiatives/{ini['id']}", json={"health": "at_risk", "health_note": " 지연 "}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["health"], body["health_note"]) == ("at_risk", "지연")
    assert body["health_updated_by"] == me["id"]
    res = await client.patch(f"/api/v1/initiatives/{ini['id']}", json={"health": "on_track"})
    assert res.json()["health_note"] is None

    # Standalone note 422; null+note 422; null clears everything.
    assert (
        await client.patch(f"/api/v1/initiatives/{ini['id']}", json={"health_note": "사유만"})
    ).status_code == 422
    assert (
        await client.patch(
            f"/api/v1/initiatives/{ini['id']}", json={"health": None, "health_note": "모순"}
        )
    ).status_code == 422
    cleared = (await client.patch(f"/api/v1/initiatives/{ini['id']}", json={"health": None})).json()
    assert (cleared["health"], cleared["health_updated_at"]) == (None, None)

    # Vocabulary + concurrency: last-write-wins, exactly one value persists.
    assert (
        await client.patch(f"/api/v1/initiatives/{ini['id']}", json={"health": "fine"})
    ).status_code == 422
    r1, r2 = await asyncio.gather(
        client.patch(f"/api/v1/initiatives/{ini['id']}", json={"health": "on_track"}),
        client.patch(
            f"/api/v1/initiatives/{ini['id']}", json={"health": "off_track", "health_note": "경합"}
        ),
    )
    assert {r1.status_code, r2.status_code} == {200}
    final = next(
        i for i in (await client.get("/api/v1/initiatives")).json()["items"] if i["id"] == ini["id"]
    )
    assert final["health"] in ("on_track", "off_track")
    if final["health"] == "on_track":
        assert final["health_note"] is None  # the winning write replaced the note

    # DB shape CHECK blocks impossible states.
    import pytest as _pytest
    from sqlalchemy.exc import IntegrityError

    with _pytest.raises(IntegrityError):
        async with app.state.sessionmaker() as session, session.begin():
            await session.execute(
                text(
                    "UPDATE initiatives SET health = 'on_track', health_updated_at = NULL "
                    "WHERE id = CAST(:id AS uuid)"
                ).bindparams(id=ini["id"])
            )
