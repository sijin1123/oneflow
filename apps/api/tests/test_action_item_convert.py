"""Action item → work package conversion (expansion PLAN Pass 6 PR-O)."""

import asyncio

from sqlalchemy import delete

from app.models import ProjectMember
from tests.conftest import create_project


async def make_meeting_with_item(client, project_id, description="후속 조치", assignee=None):
    meeting = (
        await client.post(f"/api/v1/projects/{project_id}/meetings", json={"title": "주간 회의"})
    ).json()
    body = {"description": description}
    if assignee:
        body["assignee_id"] = assignee
    item = (await client.post(f"/api/v1/meetings/{meeting['id']}/action-items", json=body)).json()
    return meeting, item


async def convert(client, item_id):
    return await client.post(f"/api/v1/action-items/{item_id}/convert")


async def test_convert_creates_linked_wp_and_is_single_shot(client):
    project = await create_project(client, key="ACT", name="액션 전환")
    me = (await client.get("/api/v1/me")).json()["id"]
    meeting, item = await make_meeting_with_item(
        client, project["id"], description="배포 체크리스트 작성", assignee=me
    )

    res = await convert(client, item["id"])
    assert res.status_code == 200, res.text
    converted = res.json()
    assert converted["done"] is True
    wp_id = converted["converted_wp_id"]
    assert wp_id

    wp = (await client.get(f"/api/v1/work-packages/{wp_id}")).json()
    assert wp["subject"] == "배포 체크리스트 작성"
    assert wp["assignee_id"] == me  # current member → inherited
    assert meeting["title"] in wp["description"]

    # Single shot: converting again is a clean 409.
    assert (await convert(client, item["id"])).status_code == 409


async def test_concurrent_convert_succeeds_exactly_once(client):
    project = await create_project(client, key="ACC", name="동시 전환")
    _, item = await make_meeting_with_item(client, project["id"], description="동시 경쟁")
    r1, r2 = await asyncio.gather(convert(client, item["id"]), convert(client, item["id"]))
    assert sorted([r1.status_code, r2.status_code]) == [200, 409]
    # Exactly one WP carries the subject.
    listed = (
        await client.get(
            f"/api/v1/projects/{project['id']}/work-packages", params={"q": "동시 경쟁"}
        )
    ).json()
    assert listed["total"] == 1


async def test_stale_assignee_converts_unassigned(client, app, member_project):
    """An assignee who left the project must not block conversion — the WP
    starts unassigned instead (PLAN P6-1 edge contract)."""
    pid = str(member_project["project_id"])
    owner_id = member_project["owner_id"]
    _, item = await make_meeting_with_item(
        client, pid, description="이탈 담당자", assignee=str(owner_id)
    )
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            delete(ProjectMember).where(
                ProjectMember.project_id == member_project["project_id"],
                ProjectMember.user_id == owner_id,
            )
        )

    res = await convert(client, item["id"])
    assert res.status_code == 200, res.text
    wp = (await client.get(f"/api/v1/work-packages/{res.json()['converted_wp_id']}")).json()
    assert wp["assignee_id"] is None


async def test_convert_guards(client, app, foreign_project):
    # Non-member: existence hidden.
    project = await create_project(client, key="ACG", name="가드")
    _, item = await make_meeting_with_item(client, project["id"])
    # Archived project → 409 (write gate through the scoped getter).
    assert (await client.post(f"/api/v1/projects/{project['id']}/archive")).status_code == 200
    assert (await convert(client, item["id"])).status_code == 409
    await client.post(f"/api/v1/projects/{project['id']}/unarchive")
    assert (await convert(client, item["id"])).status_code == 200
