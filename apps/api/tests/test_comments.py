"""Comments + activity history (PLAN §3 Phase 1 follow-up)."""

import pytest

from tests.conftest import create_project, create_wp


@pytest.fixture
async def project(client):
    return await create_project(client, key="CMT", name="코멘트 테스트")


async def test_comment_roundtrip(client, project):
    wp = await create_wp(client, project["id"], subject="코멘트 대상")
    res = await client.post(
        f"/api/v1/work-packages/{wp['id']}/comments", json={"body": "  첫 코멘트  "}
    )
    assert res.status_code == 201
    assert res.json()["body"] == "첫 코멘트"  # trimmed

    listed = await client.get(f"/api/v1/work-packages/{wp['id']}/comments")
    body = listed.json()
    assert body["total"] == 1
    assert body["items"][0]["body"] == "첫 코멘트"


async def test_comment_blank_rejected(client, project):
    wp = await create_wp(client, project["id"])
    res = await client.post(f"/api/v1/work-packages/{wp['id']}/comments", json={"body": "   "})
    assert res.status_code == 422


async def test_activity_recorded_on_create_and_patch(client, project):
    wp = await create_wp(client, project["id"], subject="활동 대상")
    acts = (await client.get(f"/api/v1/work-packages/{wp['id']}/activities")).json()
    assert acts["total"] == 1
    assert acts["items"][0]["action"] == "created"

    patched = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "status": "in_progress", "priority": "high"},
    )
    assert patched.status_code == 200
    acts = (await client.get(f"/api/v1/work-packages/{wp['id']}/activities")).json()
    changes = [a for a in acts["items"] if a["action"] == "field_changed"]
    fields = {a["field"]: (a["old_value"], a["new_value"]) for a in changes}
    assert fields["status"] == ("backlog", "in_progress")
    assert fields["priority"] == ("none", "high")


async def test_empty_patch_records_no_activity(client, project):
    wp = await create_wp(client, project["id"])
    before = (await client.get(f"/api/v1/work-packages/{wp['id']}/activities")).json()["total"]
    await client.patch(f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 0})
    after = (await client.get(f"/api/v1/work-packages/{wp['id']}/activities")).json()["total"]
    assert after == before  # no-op PATCH adds nothing


async def test_unchanged_field_records_no_activity(client, project):
    wp = await create_wp(client, project["id"], subject="같은 값")
    await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "status": "backlog"},  # already backlog
    )
    acts = (await client.get(f"/api/v1/work-packages/{wp['id']}/activities")).json()
    assert not [a for a in acts["items"] if a["action"] == "field_changed"]


async def test_comment_records_commented_activity(client, project):
    wp = await create_wp(client, project["id"])
    await client.post(f"/api/v1/work-packages/{wp['id']}/comments", json={"body": "note"})
    acts = (await client.get(f"/api/v1/work-packages/{wp['id']}/activities")).json()
    assert any(a["action"] == "commented" for a in acts["items"])


async def test_nonmember_comments_activities_hidden(client, foreign_project):
    wp_id = foreign_project["wp_id"]
    assert (await client.get(f"/api/v1/work-packages/{wp_id}/comments")).status_code == 404
    assert (
        await client.post(f"/api/v1/work-packages/{wp_id}/comments", json={"body": "x"})
    ).status_code == 404
    assert (await client.get(f"/api/v1/work-packages/{wp_id}/activities")).status_code == 404
