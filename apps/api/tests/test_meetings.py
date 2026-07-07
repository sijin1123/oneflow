"""Project meetings + action items (follow-up collaboration module)."""

import pytest

from tests.conftest import create_project


@pytest.fixture
async def project(client):
    return await create_project(client, key="MTG", name="회의")


async def test_meeting_crud_and_embedded_action_items(client, project):
    pid = project["id"]
    created = await client.post(
        f"/api/v1/projects/{pid}/meetings",
        json={"title": "  스프린트 계획  ", "scheduled_on": "2026-07-10"},
    )
    assert created.status_code == 201
    mtg = created.json()
    assert mtg["title"] == "스프린트 계획"
    assert mtg["scheduled_on"] == "2026-07-10"
    assert mtg["action_items"] == []

    listed = (await client.get(f"/api/v1/projects/{pid}/meetings")).json()
    assert listed["total"] == 1
    assert "agenda" not in listed["items"][0]  # list omits rich fields

    # edit agenda/minutes (sanitized, version bump)
    patched = await client.patch(
        f"/api/v1/meetings/{mtg['id']}",
        json={
            "expected_version": 0,
            "agenda": "<p>안건</p><script>x</script>",
            "minutes": "<p>회의록</p>",
        },
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["version"] == 1
    assert "script" not in (body["agenda"] or "")

    # add an action item → appears embedded on the meeting
    item = await client.post(
        f"/api/v1/meetings/{mtg['id']}/action-items",
        json={"description": "배포 스크립트 점검"},
    )
    assert item.status_code == 201
    iid = item.json()["id"]

    full = (await client.get(f"/api/v1/meetings/{mtg['id']}")).json()
    assert len(full["action_items"]) == 1
    assert full["action_items"][0]["done"] is False

    # toggle done
    toggled = await client.patch(f"/api/v1/action-items/{iid}", json={"done": True})
    assert toggled.json()["done"] is True

    # delete item then meeting
    assert (await client.delete(f"/api/v1/action-items/{iid}")).status_code == 204
    assert (await client.delete(f"/api/v1/meetings/{mtg['id']}")).status_code == 204
    assert (await client.get(f"/api/v1/projects/{pid}/meetings")).json()["total"] == 0


async def test_meeting_stale_update_conflicts(client, project):
    pid = project["id"]
    mtg = (await client.post(f"/api/v1/projects/{pid}/meetings", json={"title": "M"})).json()
    await client.patch(f"/api/v1/meetings/{mtg['id']}", json={"expected_version": 0, "title": "M1"})
    conflict = await client.patch(
        f"/api/v1/meetings/{mtg['id']}", json={"expected_version": 0, "title": "stale"}
    )
    assert conflict.status_code == 409
    assert conflict.json()["current"]["version"] == 1


async def test_action_item_assignee_must_be_member(client, project):
    pid = project["id"]
    mtg = (await client.post(f"/api/v1/projects/{pid}/meetings", json={"title": "M"})).json()
    import uuid

    stranger = str(uuid.uuid4())
    res = await client.post(
        f"/api/v1/meetings/{mtg['id']}/action-items",
        json={"description": "x", "assignee_id": stranger},
    )
    assert res.status_code == 422


async def test_meetings_are_member_scoped(client, foreign_project):
    pid = foreign_project["project_id"]
    assert (await client.get(f"/api/v1/projects/{pid}/meetings")).status_code == 404
    assert (
        await client.post(f"/api/v1/projects/{pid}/meetings", json={"title": "x"})
    ).status_code == 404


async def make_meeting(client, pid, title="주간회의", scheduled_on="2026-07-10"):
    body = {"title": title}
    if scheduled_on is not None:
        body["scheduled_on"] = scheduled_on
    res = await client.post(f"/api/v1/projects/{pid}/meetings", json=body)
    assert res.status_code == 201, res.text
    return res.json()


async def test_follow_up_carries_agenda_and_open_unconverted_items(client, project):
    """Pass 34 PR-AZ: follow-up copies agenda + open UNCONVERTED items only;
    the source meeting keeps its full record (copy, never move)."""
    pid = project["id"]
    mtg = await make_meeting(client, pid)
    await client.patch(
        f"/api/v1/meetings/{mtg['id']}",
        json={"expected_version": 0, "agenda": "<p>안건 1</p>", "minutes": "<p>지난 논의</p>"},
    )
    me = (await client.get("/api/v1/me")).json()
    open_item = (
        await client.post(
            f"/api/v1/meetings/{mtg['id']}/action-items",
            json={"description": "미결 항목", "assignee_id": me["id"]},
        )
    ).json()
    done_item = (
        await client.post(
            f"/api/v1/meetings/{mtg['id']}/action-items", json={"description": "완료 항목"}
        )
    ).json()
    await client.patch(f"/api/v1/action-items/{done_item['id']}", json={"done": True})
    converted = (
        await client.post(
            f"/api/v1/meetings/{mtg['id']}/action-items", json={"description": "전환 항목"}
        )
    ).json()
    res = await client.post(f"/api/v1/action-items/{converted['id']}/convert", json={})
    assert res.status_code == 200, res.text

    created = await client.post(f"/api/v1/meetings/{mtg['id']}/follow-up", json={})
    assert created.status_code == 201, created.text
    fu = created.json()
    assert fu["title"] == mtg["title"]
    assert fu["scheduled_on"] == "2026-07-17"  # source + 7 days
    assert fu["agenda"] == "<p>안건 1</p>"
    assert fu["minutes"] is None
    assert fu["version"] == 0
    carried = fu["action_items"]
    assert [i["description"] for i in carried] == ["미결 항목"]
    assert carried[0]["assignee_id"] == me["id"]  # active member — kept
    assert carried[0]["done"] is False
    assert carried[0]["id"] != open_item["id"]  # a copy, not a move

    # The source meeting is untouched.
    src = (await client.get(f"/api/v1/meetings/{mtg['id']}")).json()
    assert len(src["action_items"]) == 3
    assert src["minutes"] == "<p>지난 논의</p>"

    # Duplicate defense (R1-①): same title+date again → 409; a different
    # explicit date is a fresh follow-up.
    assert (
        await client.post(f"/api/v1/meetings/{mtg['id']}/follow-up", json={})
    ).status_code == 409
    ok = await client.post(
        f"/api/v1/meetings/{mtg['id']}/follow-up", json={"scheduled_on": "2026-07-24"}
    )
    assert ok.status_code == 201

    # carry_open_items=false copies the agenda only.
    bare = await client.post(
        f"/api/v1/meetings/{mtg['id']}/follow-up",
        json={"scheduled_on": "2026-07-31", "carry_open_items": False},
    )
    assert bare.status_code == 201
    assert bare.json()["action_items"] == []


async def test_follow_up_undated_and_concurrency(client, project):
    import asyncio

    pid = project["id"]
    mtg = await make_meeting(client, pid, title="무일정 회의", scheduled_on=None)
    first = await client.post(f"/api/v1/meetings/{mtg['id']}/follow-up", json={})
    assert first.status_code == 201
    assert first.json()["scheduled_on"] is None
    # NULL-safe duplicate probe: a second undated follow-up is a duplicate.
    assert (
        await client.post(f"/api/v1/meetings/{mtg['id']}/follow-up", json={})
    ).status_code == 409

    # Concurrent creation converges on ONE follow-up (advisory lock 427006).
    race = await make_meeting(client, pid, title="레이스 회의", scheduled_on="2026-08-03")
    r1, r2 = await asyncio.gather(
        client.post(f"/api/v1/meetings/{race['id']}/follow-up", json={}),
        client.post(f"/api/v1/meetings/{race['id']}/follow-up", json={}),
    )
    assert sorted([r1.status_code, r2.status_code]) == [201, 409]


async def test_follow_up_assignee_membership_and_activity_recheck(client, app, project):
    """A carried item is a NEW assignment (R1-③): the assignee survives only
    as a current ACTIVE member — deactivated or removed users become null."""

    pid = project["id"]
    inactive = (
        await client.post(
            "/api/v1/users", json={"email": "gone@corp.com", "display_name": "비활성"}
        )
    ).json()
    removed = (
        await client.post("/api/v1/users", json={"email": "left@corp.com", "display_name": "탈퇴"})
    ).json()
    for email in ("gone@corp.com", "left@corp.com"):
        assert (
            await client.post(
                f"/api/v1/projects/{pid}/members", json={"email": email, "role": "member"}
            )
        ).status_code == 201

    mtg = await make_meeting(client, pid, title="담당자 재검증")
    for uid in (inactive["id"], removed["id"]):
        res = await client.post(
            f"/api/v1/meetings/{mtg['id']}/action-items",
            json={"description": f"담당 {uid[:8]}", "assignee_id": uid},
        )
        assert res.status_code == 201, res.text

    assert (
        await client.patch(f"/api/v1/users/{inactive['id']}", json={"is_active": False})
    ).status_code == 200
    assert (
        await client.delete(f"/api/v1/projects/{pid}/members/{removed['id']}")
    ).status_code == 204

    fu = (await client.post(f"/api/v1/meetings/{mtg['id']}/follow-up", json={})).json()
    assert [i["assignee_id"] for i in fu["action_items"]] == [None, None]

    # The SOURCE items keep their stored assignees — history is preserved.
    src = (await client.get(f"/api/v1/meetings/{mtg['id']}")).json()
    assert {i["assignee_id"] for i in src["action_items"]} == {inactive["id"], removed["id"]}


async def test_follow_up_guards(client, app, project, foreign_project):
    from app.models.meeting import Meeting

    pid = project["id"]
    mtg = await make_meeting(client, pid, title="가드 회의")
    # Archived project: central write gate.
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (
        await client.post(f"/api/v1/meetings/{mtg['id']}/follow-up", json={})
    ).status_code == 409
    await client.post(f"/api/v1/projects/{pid}/unarchive")

    # Non-member: existence hidden (404, never 403).
    async with app.state.sessionmaker() as session, session.begin():
        foreign = Meeting(project_id=foreign_project["project_id"], title="남의 회의")
        session.add(foreign)
        await session.flush()
        foreign_id = foreign.id
    assert (
        await client.post(f"/api/v1/meetings/{foreign_id}/follow-up", json={})
    ).status_code == 404
