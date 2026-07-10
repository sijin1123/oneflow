"""set_assignee automation action (expansion PLAN Pass 16 PR-AH).

Contract (v16.1): the value must be a CURRENT member at save time (422) and is
rechecked at fire time — an ex-member rule skips the field silently (no apply,
no run, no fired); an applied auto-assignment logs a run and notifies through
the ordinary assignment path exactly once."""

import uuid

import pytest
from sqlalchemy import delete as sa_delete
from sqlalchemy import select

from app.models.member import ProjectMember
from app.models.notification import Notification
from tests.conftest import create_wp


async def create_rule(client, pid, assignee, **over):
    body = {
        "name": "완료되면 담당자 지정",
        "trigger_type": "status_changed_to",
        "trigger_value": "done",
        "action_type": "set_assignee",
        "action_value": assignee,
    }
    body.update(over)
    return await client.post(f"/api/v1/projects/{pid}/automation-rules", json=body)


@pytest.fixture
async def shared(client, member_project):
    """A project the DEV USER OWNS (rule edits are owner-only), with the
    member_project's owner added as a plain member — the assignable target."""
    from tests.conftest import create_project

    project = await create_project(client, key="ASGN", name="자동 배정 프로젝트")
    res = await client.post(
        f"/api/v1/projects/{project['id']}/members",
        json={"email": "owner@oneflow.local", "role": "member"},
    )
    assert res.status_code == 201, res.text
    return {
        "pid": project["id"],
        "owner_id": str(member_project["owner_id"]),
        "raw": {**member_project, "project_id": project["id"]},
    }


async def test_save_time_validation(client, shared, foreign_project):
    pid = shared["pid"]
    # Non-uuid and non-member values are 422 at create…
    assert (await create_rule(client, pid, "not-a-uuid")).status_code == 422
    stranger = str(foreign_project["user_id"])
    assert (await create_rule(client, pid, stranger)).status_code == 422
    # …and via merged PATCH (switching an existing rule's value).
    rule = (await create_rule(client, pid, shared["owner_id"])).json()
    res = await client.patch(
        f"/api/v1/projects/{pid}/automation-rules/{rule['id']}", json={"action_value": stranger}
    )
    assert res.status_code == 422


async def test_fire_assigns_logs_and_notifies_once(client, app, shared):
    pid = shared["pid"]
    owner_id = shared["owner_id"]
    assert (await create_rule(client, pid, owner_id)).status_code == 201
    wp = await create_wp(client, pid, subject="자동 배정 대상")

    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 0, "status": "done"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["assignee_id"] == owner_id

    runs = (await client.get(f"/api/v1/projects/{pid}/automation-rules/runs")).json()
    assert runs["total"] == 1
    assert (runs["items"][0]["field"], runs["items"][0]["new_value"]) == (
        "assignee_id",
        owner_id,
    )
    async with app.state.sessionmaker() as session:
        notes = (
            (
                await session.execute(
                    select(Notification).where(
                        Notification.user_id == shared["raw"]["owner_id"],
                        Notification.kind == "assigned",
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(notes) == 1  # ordinary assignment path, exactly once


async def test_user_explicit_assignee_beats_automation(client, shared):
    pid = shared["pid"]
    owner_id = shared["owner_id"]
    dev_id = str(shared["raw"]["dev_id"])
    await create_rule(client, pid, owner_id)
    wp = await create_wp(client, pid, subject="명시 우선")

    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "status": "done", "assignee_id": dev_id},
    )
    assert res.json()["assignee_id"] == dev_id
    runs = (await client.get(f"/api/v1/projects/{pid}/automation-rules/runs")).json()
    assert runs["total"] == 0  # override → no run, no fired


async def test_ex_member_rule_skips_silently(client, app, shared):
    pid = shared["pid"]
    owner_id = shared["owner_id"]
    assert (await create_rule(client, pid, owner_id)).status_code == 201
    # The owner leaves AFTER the rule was saved.
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            sa_delete(ProjectMember).where(
                ProjectMember.project_id == uuid.UUID(shared["pid"]),
                ProjectMember.user_id == shared["raw"]["owner_id"],
            )
        )
    wp = await create_wp(client, pid, subject="탈퇴자 규칙")
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 0, "status": "done"}
    )
    assert res.status_code == 200
    assert res.json()["assignee_id"] is None  # field skipped, change still applied
    runs = (await client.get(f"/api/v1/projects/{pid}/automation-rules/runs")).json()
    assert runs["total"] == 0
    rules = (await client.get(f"/api/v1/projects/{pid}/automation-rules")).json()
    assert rules["items"][0]["fired_count"] == 0
