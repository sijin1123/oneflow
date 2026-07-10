"""Work-package duplicate (expansion PLAN Pass 12 PR-AA).

Contract (v12.1): copies core fields + valid custom values; status resets to
backlog and parent/relations/comments/attachments never copy; assignee copies
only while still a member (R1-⑤); custom values re-run the write fan-in —
inactive/unbound/invalid values are counted in skipped_custom_values, not
smuggled (R1-④); duplicating a disabled type is new usage → 422."""

import pytest
from sqlalchemy import delete as sa_delete

from app.models.member import ProjectMember
from tests.conftest import create_project, create_wp


async def dup(client, wp_id):
    return await client.post(f"/api/v1/work-packages/{wp_id}/duplicate")


@pytest.fixture
async def project(client):
    return await create_project(client, key="DUP", name="복제 프로젝트")


async def test_duplicate_copies_core_fields_and_resets_status(client, project):
    pid = project["id"]
    me = (await client.get("/api/v1/me")).json()["id"]
    parent = await create_wp(client, pid, subject="부모")
    src = await create_wp(
        client,
        pid,
        subject="원본 작업",
        type="bug",
        status="in_progress",
        priority="high",
        assignee_id=me,
        parent_id=parent["id"],
        start_date="2026-07-01",
        due_date="2026-07-20",
        estimated_hours=8,
    )

    res = await dup(client, src["id"])
    assert res.status_code == 201, res.text
    body = res.json()
    copy = body["work_package"]
    assert copy["subject"] == "(복사) 원본 작업"
    assert (copy["type"], copy["priority"]) == ("bug", "high")
    assert copy["status"] == "backlog"  # a duplicate starts over
    assert copy["parent_id"] is None  # no tree duplication
    assert copy["assignee_id"] == me
    assert (copy["start_date"], copy["due_date"]) == ("2026-07-01", "2026-07-20")
    assert copy["created_by"] == me
    assert copy["version"] == 0
    assert body["skipped_custom_values"] == 0

    # Relations/comments never copy (none exist here — the list stays empty).
    rel = (await client.get(f"/api/v1/work-packages/{copy['id']}/relations")).json()
    assert rel["total"] == 0


async def test_duplicate_custom_values_filtered_by_current_rules(client, project):
    pid = project["id"]
    text_field = (
        await client.post(
            f"/api/v1/projects/{pid}/custom-fields", json={"name": "메모", "field_type": "text"}
        )
    ).json()
    bug_field = (
        await client.post(
            f"/api/v1/projects/{pid}/custom-fields",
            json={"name": "재현 절차", "field_type": "text", "applies_to": ["bug"]},
        )
    ).json()
    src = await create_wp(client, pid, subject="값 원본", type="bug")
    res = await client.put(
        f"/api/v1/work-packages/{src['id']}/custom-values",
        json={
            "values": [
                {"field_id": text_field["id"], "value": "복사될 값"},
                {"field_id": bug_field["id"], "value": "버그 전용 값"},
            ]
        },
    )
    assert res.status_code == 200, res.text

    # Deactivate one field AFTER the value was stored → it must not copy.
    res = await client.patch(
        f"/api/v1/projects/{pid}/custom-fields/{text_field['id']}", json={"is_active": False}
    )
    assert res.status_code == 200, res.text

    body = (await dup(client, src["id"])).json()
    assert body["skipped_custom_values"] == 1  # the inactive field's value
    values = (
        await client.get(f"/api/v1/work-packages/{body['work_package']['id']}/custom-values")
    ).json()
    by_field = {v["field_id"]: v["value"] for v in values["items"]}
    assert by_field == {bug_field["id"]: "버그 전용 값"}


async def test_duplicate_drops_ex_member_assignee(client, app, member_project):
    pid = str(member_project["project_id"])
    owner_id = member_project["owner_id"]
    src = await create_wp(client, pid, subject="담당자 원본", assignee_id=str(owner_id))

    # The owner leaves the project; the stored assignee remains on the source.
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            sa_delete(ProjectMember).where(
                ProjectMember.project_id == member_project["project_id"],
                ProjectMember.user_id == owner_id,
            )
        )

    body = (await dup(client, src["id"])).json()
    assert body["work_package"]["assignee_id"] is None  # not carried (R1-⑤)


async def test_duplicate_guards(client, project, foreign_project):
    pid = project["id"]
    src = await create_wp(client, pid, subject="가드 원본", type="bug")

    # Disabled type = new usage → 422.
    types = (await client.get(f"/api/v1/projects/{pid}/types")).json()["items"]
    bug = next(t for t in types if t["key"] == "bug")
    await client.patch(f"/api/v1/projects/{pid}/types/{bug['id']}", json={"is_active": False})
    assert (await dup(client, src["id"])).status_code == 422
    await client.patch(f"/api/v1/projects/{pid}/types/{bug['id']}", json={"is_active": True})

    # Non-member 404 (existence hiding), archived 409.
    assert (await dup(client, str(foreign_project["wp_id"]))).status_code == 404
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (await dup(client, src["id"])).status_code == 409
    await client.post(f"/api/v1/projects/{pid}/unarchive")
