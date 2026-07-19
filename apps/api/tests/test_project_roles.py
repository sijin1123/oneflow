import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.core.authz import member_has_permission
from app.models import Project, ProjectRole, ProjectRoleEvent, User
from tests.conftest import create_project


async def _create_role(client, *, name="Workflow manager", permissions=None):
    response = await client.post(
        "/api/v1/admin/workspace/project-roles",
        json={
            "name": name,
            "description": "Can maintain project workflow configuration.",
            "permissions": permissions or ["status.manage", "field.manage"],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
async def role_target(app):
    async with app.state.sessionmaker() as session, session.begin():
        user = User(email="role-target@oneflow.local", display_name="Role Target")
        session.add(user)
        await session.flush()
        return {"id": user.id, "email": user.email}


async def test_project_role_catalog_lifecycle_and_audit(client):
    capabilities = await client.get("/api/v1/workspace/project-role-capabilities")
    assert capabilities.status_code == 200
    assert capabilities.json()["total"] == 7
    assert [item["key"] for item in capabilities.json()["items"]] == [
        "status.manage",
        "project_type.manage",
        "field.manage",
        "cycle.manage",
        "module.manage",
        "automation.manage",
        "intake.triage",
    ]

    role = await _create_role(client)
    assert role["revision"] == 1
    assert role["assigned_member_count"] == 0
    assert role["permissions"] == ["status.manage", "field.manage"]

    duplicate = await client.post(
        "/api/v1/admin/workspace/project-roles",
        json={"name": " workflow MANAGER ", "permissions": []},
    )
    assert duplicate.status_code == 409

    updated = await client.patch(
        f"/api/v1/admin/workspace/project-roles/{role['id']}",
        json={
            "expected_revision": 1,
            "name": "Delivery manager",
            "description": None,
            "permissions": ["cycle.manage", "status.manage"],
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["revision"] == 2
    assert updated.json()["description"] is None
    assert updated.json()["permissions"] == ["status.manage", "cycle.manage"]

    stale = await client.patch(
        f"/api/v1/admin/workspace/project-roles/{role['id']}",
        json={"expected_revision": 1, "name": "Stale"},
    )
    assert stale.status_code == 412
    assert stale.json()["detail"] == {"code": "stale_revision", "current_revision": 2}

    archived = await client.post(
        f"/api/v1/admin/workspace/project-roles/{role['id']}/archive",
        json={"expected_revision": 2},
    )
    assert archived.status_code == 200
    assert archived.json()["revision"] == 3
    assert archived.json()["archived_at"] is not None
    assert (await client.get("/api/v1/workspace/project-roles")).json()["total"] == 0
    assert (await client.get("/api/v1/admin/workspace/project-roles?include_archived=true")).json()[
        "total"
    ] == 1

    edit_archived = await client.patch(
        f"/api/v1/admin/workspace/project-roles/{role['id']}",
        json={"expected_revision": 3, "name": "Cannot edit"},
    )
    assert edit_archived.status_code == 409

    restored = await client.post(
        f"/api/v1/admin/workspace/project-roles/{role['id']}/restore",
        json={"expected_revision": 3},
    )
    assert restored.status_code == 200
    assert restored.json()["revision"] == 4
    assert restored.json()["archived_at"] is None

    events = await client.get(f"/api/v1/admin/workspace/project-roles/{role['id']}/events")
    assert events.status_code == 200
    assert events.json()["total"] == 4
    assert events.json()["limit"] == 50
    assert events.json()["offset"] == 0
    assert {item["event_type"] for item in events.json()["items"]} == {
        "created",
        "updated",
        "archived",
        "restored",
    }
    assert events.json()["items"][0]["snapshot"]["name"] == "Delivery manager"


async def test_project_role_rejects_non_delegable_or_duplicate_permissions(client):
    non_delegable = await client.post(
        "/api/v1/admin/workspace/project-roles",
        json={"name": "Too powerful", "permissions": ["member.manage"]},
    )
    assert non_delegable.status_code == 422

    duplicate = await client.post(
        "/api/v1/admin/workspace/project-roles",
        json={"name": "Repeated", "permissions": ["status.manage", "status.manage"]},
    )
    assert duplicate.status_code == 422

    reserved = await client.post(
        "/api/v1/admin/workspace/project-roles",
        json={"name": " OWNER ", "permissions": []},
    )
    assert reserved.status_code == 422


async def test_project_role_admin_boundary(app, client, dev_user):
    async with app.state.sessionmaker() as session, session.begin():
        current = await session.get(User, dev_user.id)
        current.is_admin = False
    assert (await client.get("/api/v1/workspace/project-roles")).status_code == 200
    denied = await client.post(
        "/api/v1/admin/workspace/project-roles",
        json={"name": "Denied", "permissions": []},
    )
    assert denied.status_code == 403


async def test_member_custom_role_assignment_and_effective_permission(
    app, client, dev_user, role_target
):
    role = await _create_role(
        client,
        permissions=["status.manage", "automation.manage"],
    )
    project = await create_project(client, key="CR1")
    add = await client.post(
        f"/api/v1/projects/{project['id']}/members",
        json={
            "email": role_target["email"],
            "role": "member",
            "custom_role_id": role["id"],
        },
    )
    assert add.status_code == 201, add.text
    assert add.json()["custom_role_id"] == role["id"]
    assert add.json()["custom_role_name"] == "Workflow manager"

    roster = await client.get(f"/api/v1/projects/{project['id']}/members")
    assigned = next(
        item for item in roster.json()["items"] if item["user_id"] == str(role_target["id"])
    )
    assert assigned["custom_role_name"] == "Workflow manager"
    catalog = await client.get("/api/v1/admin/workspace/project-roles")
    assert catalog.json()["items"][0]["assigned_member_count"] == 1

    async with app.state.sessionmaker() as session:
        assert await member_has_permission(
            session,
            uuid.UUID(project["id"]),
            role_target["id"],
            "status.manage",
        )
        assert await member_has_permission(
            session,
            uuid.UUID(project["id"]),
            role_target["id"],
            "work.write",
        )
        assert not await member_has_permission(
            session,
            uuid.UUID(project["id"]),
            role_target["id"],
            "member.manage",
        )

    # Make another owner before moving the acting dev user onto the custom role.
    promote = await client.patch(
        f"/api/v1/projects/{project['id']}/members/{role_target['id']}",
        json={"role": "owner"},
    )
    assert promote.status_code == 200
    self_assign = await client.patch(
        f"/api/v1/projects/{project['id']}/members/{dev_user.id}",
        json={"role": "member", "custom_role_id": role["id"]},
    )
    assert self_assign.status_code == 200
    report = await client.get(f"/api/v1/projects/{project['id']}/permissions")
    assert report.status_code == 200
    assert report.json()["my_role"] == "member"
    assert report.json()["my_custom_role"]["id"] == role["id"]
    assert report.json()["my_custom_role"]["permissions"] == [
        "status.manage",
        "automation.manage",
    ]
    effective = {item["key"]: item["effective"] for item in report.json()["verbs"]}
    assert effective["status.manage"] == "always"
    assert effective["automation.manage"] == "always"
    assert effective["member.manage"] == "never"


async def test_archived_role_blocks_new_assignment_but_keeps_existing_permissions(
    app, client, role_target
):
    role = await _create_role(client, permissions=["status.manage"])
    project = await create_project(client, key="CR2")
    added = await client.post(
        f"/api/v1/projects/{project['id']}/members",
        json={
            "email": role_target["email"],
            "role": "member",
            "custom_role_id": role["id"],
        },
    )
    assert added.status_code == 201
    archived = await client.post(
        f"/api/v1/admin/workspace/project-roles/{role['id']}/archive",
        json={"expected_revision": 1},
    )
    assert archived.status_code == 200

    async with app.state.sessionmaker() as session, session.begin():
        second = User(email="second-role-target@oneflow.local", display_name="Second Target")
        session.add(second)
        await session.flush()
        second_id = second.id
        second_email = second.email
    denied = await client.post(
        f"/api/v1/projects/{project['id']}/members",
        json={
            "email": second_email,
            "role": "member",
            "custom_role_id": role["id"],
        },
    )
    assert denied.status_code == 409
    assert second_id

    async with app.state.sessionmaker() as session:
        assert await member_has_permission(
            session,
            uuid.UUID(project["id"]),
            role_target["id"],
            "status.manage",
        )


async def test_custom_role_cannot_replace_owner_or_viewer_semantics(client, role_target):
    role = await _create_role(client)
    project = await create_project(client, key="CR3")
    invalid = await client.post(
        f"/api/v1/projects/{project['id']}/members",
        json={
            "email": role_target["email"],
            "role": "owner",
            "custom_role_id": role["id"],
        },
    )
    assert invalid.status_code == 422


async def test_project_role_event_rows_are_durable(app, client):
    role = await _create_role(client)
    async with app.state.sessionmaker() as session:
        stored_role = await session.get(ProjectRole, uuid.UUID(role["id"]))
        events = (
            (
                await session.execute(
                    select(ProjectRoleEvent).where(ProjectRoleEvent.role_id == stored_role.id)
                )
            )
            .scalars()
            .all()
        )
    assert len(events) == 1
    assert events[0].snapshot["permissions"] == ["status.manage", "field.manage"]


async def test_custom_role_capabilities_gate_their_real_mutation_endpoints(
    app, client, dev_user, role_target
):
    role = await _create_role(client, name="Surface manager", permissions=["status.manage"])
    project = await create_project(client, key="CR4")
    project_id = project["id"]

    intake = await client.post(
        f"/api/v1/projects/{project_id}/intake",
        json={"title": "Capability-routed intake"},
    )
    assert intake.status_code == 201, intake.text

    added = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": role_target["email"], "role": "member"},
    )
    assert added.status_code == 201, added.text
    promoted = await client.patch(
        f"/api/v1/projects/{project_id}/members/{role_target['id']}",
        json={"role": "owner"},
    )
    assert promoted.status_code == 200, promoted.text
    assigned = await client.patch(
        f"/api/v1/projects/{project_id}/members/{dev_user.id}",
        json={"role": "member", "custom_role_id": role["id"]},
    )
    assert assigned.status_code == 200, assigned.text

    statuses = await client.get(f"/api/v1/projects/{project_id}/statuses")
    assert statuses.status_code == 200, statuses.text
    status_id = statuses.json()["items"][0]["id"]
    requests = [
        (
            "status.manage",
            "PATCH",
            f"/api/v1/projects/{project_id}/statuses/{status_id}",
            {"name": "Capability backlog"},
            200,
        ),
        (
            "project_type.manage",
            "POST",
            f"/api/v1/projects/{project_id}/types",
            {"name": "Incident"},
            201,
        ),
        (
            "field.manage",
            "POST",
            f"/api/v1/projects/{project_id}/custom-fields",
            {"name": "Severity", "field_type": "text"},
            201,
        ),
        (
            "cycle.manage",
            "POST",
            f"/api/v1/projects/{project_id}/cycles",
            {"name": "Cycle one", "start_date": "2026-07-20", "end_date": "2026-07-31"},
            201,
        ),
        (
            "module.manage",
            "POST",
            f"/api/v1/projects/{project_id}/modules",
            {"name": "Module one"},
            201,
        ),
        (
            "automation.manage",
            "POST",
            f"/api/v1/projects/{project_id}/automation-rules",
            {
                "name": "Escalate started work",
                "trigger_value": "in_progress",
                "action_value": "high",
            },
            201,
        ),
        (
            "intake.triage",
            "POST",
            f"/api/v1/projects/{project_id}/intake/{intake.json()['id']}/triage",
            {"status": "declined", "note": "Not planned"},
            200,
        ),
    ]

    revision = role["revision"]
    for capability, method, url, payload, expected_status in requests:
        updated = await client.patch(
            f"/api/v1/admin/workspace/project-roles/{role['id']}",
            json={"expected_revision": revision, "permissions": [capability]},
        )
        assert updated.status_code == 200, updated.text
        revision = updated.json()["revision"]
        if capability == "intake.triage":
            queue = await client.get(f"/api/v1/projects/{project_id}/intake")
            assert queue.status_code == 200, queue.text
            assert [item["id"] for item in queue.json()["items"]] == [intake.json()["id"]]
            history = await client.get(
                f"/api/v1/projects/{project_id}/intake/{intake.json()['id']}/history"
            )
            assert history.status_code == 200, history.text
        response = await client.request(method, url, json=payload)
        assert response.status_code == expected_status, (capability, response.text)

    cleared = await client.patch(
        f"/api/v1/admin/workspace/project-roles/{role['id']}",
        json={"expected_revision": revision, "permissions": []},
    )
    assert cleared.status_code == 200, cleared.text
    denied = await client.patch(
        f"/api/v1/projects/{project_id}/statuses/{status_id}",
        json={"name": "Must stay denied"},
    )
    assert denied.status_code == 403

    restored_status_permission = await client.patch(
        f"/api/v1/admin/workspace/project-roles/{role['id']}",
        json={
            "expected_revision": cleared.json()["revision"],
            "permissions": ["status.manage"],
        },
    )
    assert restored_status_permission.status_code == 200, restored_status_permission.text
    async with app.state.sessionmaker() as session, session.begin():
        stored_project = await session.get(Project, uuid.UUID(project_id))
        stored_project.archived_at = datetime.now(UTC)
    archived = await client.patch(
        f"/api/v1/projects/{project_id}/statuses/{status_id}",
        json={"name": "Must stay archived"},
    )
    assert archived.status_code == 409
