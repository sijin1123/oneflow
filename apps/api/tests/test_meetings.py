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
