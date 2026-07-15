import asyncio
import uuid

import pytest
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.models import Project, ProjectMember, ProjectTemplate, User
from app.models.project_template import (
    ProjectTemplateApplication,
    ProjectTemplateEvent,
    ProjectTemplateRevision,
)
from tests.conftest import create_project, create_wp


async def _clear_templates(app):
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text(
                "TRUNCATE TABLE project_template_applications, project_template_revisions, "
                "project_templates RESTART IDENTITY CASCADE"
            )
        )


async def _template(client, project_id, name="Delivery"):
    response = await client.post(
        "/api/v1/project-templates",
        json={"name": name, "description": "snapshot", "source_project_id": str(project_id)},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_template_lifecycle_snapshot_apply_and_delete_hiding(client, app):
    await _clear_templates(app)
    source = await create_project(client, key="SRC", name="Source")
    await create_wp(client, source["id"], subject="must not copy")
    rule = await client.post(
        f"/api/v1/projects/{source['id']}/automation-rules",
        json={
            "name": "완료 시 긴급",
            "trigger_type": "status_changed_to",
            "trigger_value": "done",
            "action_type": "set_priority",
            "action_value": "urgent",
            "is_active": True,
        },
    )
    assert rule.status_code == 201, rule.text
    template = await _template(client, source["id"])
    assert template["latest_revision"] == {
        "version": 1,
        "statuses": 6,
        "types": 4,
        "custom_fields": 0,
        "automation_rules": 1,
    }

    # The immutable revision remains usable even if its original source disappears.
    async with app.state.sessionmaker() as session, session.begin():
        source_row = await session.get(Project, uuid.UUID(source["id"]))
        await session.delete(source_row)
    applied = await client.post(
        f"/api/v1/project-templates/{template['id']}/apply",
        json={"key": "NEW", "name": "Applied"},
    )
    assert applied.status_code == 201, applied.text
    assert applied.json()["template_applied"] == {
        "statuses": 6,
        "types": 4,
        "custom_fields": 0,
        "automation_rules": 1,
    }
    applied_id = applied.json()["id"]
    assert (await client.get(f"/api/v1/projects/{applied_id}/work-packages")).json()["total"] == 0
    members = (await client.get(f"/api/v1/projects/{applied_id}/members")).json()
    assert members["total"] == 1
    rules = (await client.get(f"/api/v1/projects/{applied_id}/automation-rules")).json()["items"]
    assert [(item["name"], item["is_active"]) for item in rules] == [("완료 시 긴급", False)]
    async with app.state.sessionmaker() as session:
        applications = (await session.execute(select(ProjectTemplateApplication))).scalars().all()
        assert len(applications) == 1
        revision = await session.get(ProjectTemplateRevision, applications[0].revision_id)
        assert revision is not None and revision.version == 1

    assert (
        await client.post(f"/api/v1/project-templates/{template['id']}/archive")
    ).status_code == 200
    assert (
        await client.post(
            f"/api/v1/project-templates/{template['id']}/apply",
            json={"key": "NOPE", "name": "Nope"},
        )
    ).status_code == 409
    assert (
        await client.post(f"/api/v1/project-templates/{template['id']}/unarchive")
    ).status_code == 200
    assert (await client.delete(f"/api/v1/project-templates/{template['id']}")).status_code == 409
    assert (
        await client.post(f"/api/v1/project-templates/{template['id']}/archive")
    ).status_code == 200
    assert (await client.delete(f"/api/v1/project-templates/{template['id']}")).status_code == 204
    assert (
        await client.post(f"/api/v1/project-templates/{template['id']}/unarchive")
    ).status_code == 404
    assert (await _template(client, applied_id, name="Delivery"))["name"] == "Delivery"
    async with app.state.sessionmaker() as session:
        events = (
            (
                await session.execute(
                    select(ProjectTemplateEvent.event_type)
                    .where(ProjectTemplateEvent.template_id == uuid.UUID(template["id"]))
                    .order_by(ProjectTemplateEvent.created_at, ProjectTemplateEvent.id)
                )
            )
            .scalars()
            .all()
        )
    assert events == ["created", "archived", "unarchived", "archived", "deleted"]


async def test_catalog_source_owner_and_key_conflict_roll_back(client, app):
    await _clear_templates(app)
    owned = await create_project(client, key="OWN")
    template = await _template(client, owned["id"], name="Owned")
    async with app.state.sessionmaker() as session, session.begin():
        stranger = User(email="template-owner@oneflow.local", display_name="Template Owner")
        foreign = Project(key="FOR", name="Foreign")
        session.add_all([stranger, foreign])
        await session.flush()
        session.add(ProjectMember(project_id=foreign.id, user_id=stranger.id, role="owner"))
        foreign_id = foreign.id
    denied = await client.post(
        "/api/v1/project-templates",
        json={"name": "Denied", "source_project_id": str(foreign_id)},
    )
    assert denied.status_code == 404
    sources = (await client.get("/api/v1/project-templates/sources")).json()["items"]
    assert [item["id"] for item in sources] == [owned["id"]]

    assert (
        await client.post(
            f"/api/v1/project-templates/{template['id']}/apply",
            json={"key": "OWN", "name": "Collision"},
        )
    ).status_code == 409
    async with app.state.sessionmaker() as session:
        audit_count = await session.scalar(
            select(func.count()).select_from(ProjectTemplateApplication)
        )
    assert audit_count == 0


async def test_catalog_search_pagination_and_archived_filter(client, app):
    await _clear_templates(app)
    source = await create_project(client, key="PAG")
    first = await _template(client, source["id"], name="Alpha")
    second = await _template(client, source["id"], name="Beta")
    assert (
        await client.post(f"/api/v1/project-templates/{second['id']}/archive")
    ).status_code == 200
    listed = await client.get("/api/v1/project-templates", params={"q": "alp", "limit": 1})
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == first["id"]
    archived = await client.get("/api/v1/project-templates", params={"include_archived": "true"})
    assert archived.json()["total"] == 2


async def test_concurrent_archive_is_idempotent_and_audited_once(client, app):
    await _clear_templates(app)
    source = await create_project(client, key="CON", name="Concurrent source")
    template = await _template(client, source["id"], name="Concurrent lifecycle")

    responses = await asyncio.gather(
        client.post(f"/api/v1/project-templates/{template['id']}/archive"),
        client.post(f"/api/v1/project-templates/{template['id']}/archive"),
    )
    assert [response.status_code for response in responses] == [200, 200]
    async with app.state.sessionmaker() as session:
        archive_events = await session.scalar(
            select(func.count())
            .select_from(ProjectTemplateEvent)
            .where(
                ProjectTemplateEvent.template_id == uuid.UUID(template["id"]),
                ProjectTemplateEvent.event_type == "archived",
            )
        )
    assert archive_events == 1


async def test_revision_is_immutable_after_source_drift(client, app):
    await _clear_templates(app)
    source = await create_project(client, key="REV", name="Revision source")
    template = await _template(client, source["id"], name="Versioned")
    statuses = (await client.get(f"/api/v1/projects/{source['id']}/statuses")).json()["items"]
    todo = next(item for item in statuses if item["key"] == "todo")
    assert (
        await client.patch(
            f"/api/v1/projects/{source['id']}/statuses/{todo['id']}",
            json={"name": "리비전 2"},
        )
    ).status_code == 200
    refreshed = await client.post(
        f"/api/v1/project-templates/{template['id']}/revisions",
        json={"source_project_id": source["id"]},
    )
    assert refreshed.status_code == 201, refreshed.text
    assert refreshed.json()["latest_revision"]["version"] == 2
    assert (
        await client.patch(
            f"/api/v1/projects/{source['id']}/statuses/{todo['id']}",
            json={"name": "원본이 다시 변경됨"},
        )
    ).status_code == 200

    applied = await client.post(
        f"/api/v1/project-templates/{template['id']}/apply",
        json={"key": "REVAPP", "name": "Revision applied"},
    )
    assert applied.status_code == 201, applied.text
    copied = (await client.get(f"/api/v1/projects/{applied.json()['id']}/statuses")).json()["items"]
    assert next(item for item in copied if item["key"] == "todo")["name"] == "리비전 2"


async def test_noncreator_catalog_permissions_are_server_derived(client, app):
    await _clear_templates(app)
    source = await create_project(client, key="AUTH", name="Auth source")
    template = await _template(client, source["id"], name="Managed elsewhere")
    async with app.state.sessionmaker() as session, session.begin():
        dev = (
            await session.execute(select(User).where(User.email == "dev@oneflow.local"))
        ).scalar_one()
        other = User(email="template-manager@oneflow.local", display_name="Template manager")
        session.add(other)
        await session.flush()
        row = await session.get(ProjectTemplate, uuid.UUID(template["id"]))
        row.created_by = other.id
        dev.is_admin = False

    listed = (await client.get("/api/v1/project-templates")).json()["items"]
    assert next(item for item in listed if item["id"] == template["id"])["can_manage"] is False
    assert (
        await client.post(f"/api/v1/project-templates/{template['id']}/archive")
    ).status_code == 404
    applied = await client.post(
        f"/api/v1/project-templates/{template['id']}/apply",
        json={"key": "AUTHAPP", "name": "Allowed apply"},
    )
    assert applied.status_code == 201, applied.text


async def test_unpublished_templates_are_visible_only_to_managers(client, app):
    await _clear_templates(app)
    source = await create_project(client, key="DRAFT", name="Draft source")
    response = await client.post(
        "/api/v1/project-templates",
        json={
            "name": "Private draft",
            "source_project_id": source["id"],
            "publish": False,
        },
    )
    assert response.status_code == 201, response.text
    draft = response.json()
    assert draft["archived_at"] is not None
    assert (await client.get("/api/v1/project-templates")).json()["items"] == []
    managed = (
        await client.get(
            "/api/v1/project-templates",
            params={"include_archived": "true"},
        )
    ).json()["items"]
    assert [item["id"] for item in managed] == [draft["id"]]
    assert managed[0]["can_manage"] is True

    async with app.state.sessionmaker() as session, session.begin():
        dev = (
            await session.execute(select(User).where(User.email == "dev@oneflow.local"))
        ).scalar_one()
        other = User(email="template-publisher@oneflow.local", display_name="Publisher")
        session.add(other)
        await session.flush()
        row = await session.get(ProjectTemplate, uuid.UUID(draft["id"]))
        row.created_by = other.id
        dev.is_admin = False

    hidden = await client.get(
        "/api/v1/project-templates",
        params={"include_archived": "true"},
    )
    assert hidden.status_code == 200
    assert hidden.json()["items"] == []
    assert hidden.json()["total"] == 0


async def test_catalog_search_treats_wildcards_literally(client, app):
    await _clear_templates(app)
    source = await create_project(client, key="LIT", name="Literal source")
    literal = await _template(client, source["id"], name="100%_ready")
    await _template(client, source["id"], name="ordinary")
    result = await client.get("/api/v1/project-templates", params={"q": "%_"})
    assert result.status_code == 200
    assert [item["id"] for item in result.json()["items"]] == [literal["id"]]


async def test_revision_rows_are_immutable_and_application_revision_matches_template(client, app):
    await _clear_templates(app)
    source = await create_project(client, key="IMM", name="Immutable source")
    first = await _template(client, source["id"], name="Immutable one")
    second = await _template(client, source["id"], name="Immutable two")
    async with app.state.sessionmaker() as session:
        revisions = (
            (
                await session.execute(
                    select(ProjectTemplateRevision).order_by(ProjectTemplateRevision.template_id)
                )
            )
            .scalars()
            .all()
        )
        first_revision = next(row for row in revisions if row.template_id == uuid.UUID(first["id"]))
        second_revision = next(
            row for row in revisions if row.template_id == uuid.UUID(second["id"])
        )

    async with app.state.sessionmaker() as session:
        with pytest.raises(DBAPIError):
            await session.execute(
                update(ProjectTemplateRevision)
                .where(ProjectTemplateRevision.id == first_revision.id)
                .values(version=99)
            )
            await session.commit()
        await session.rollback()
    async with app.state.sessionmaker() as session:
        with pytest.raises(DBAPIError):
            await session.execute(
                delete(ProjectTemplateRevision).where(
                    ProjectTemplateRevision.id == first_revision.id
                )
            )
            await session.commit()
        await session.rollback()

    target = await create_project(client, key="MIS", name="Mismatch audit target")
    async with app.state.sessionmaker() as session:
        session.add(
            ProjectTemplateApplication(
                template_id=uuid.UUID(first["id"]),
                revision_id=second_revision.id,
                project_id=uuid.UUID(target["id"]),
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()

    async with app.state.sessionmaker() as session:
        session.add(
            ProjectTemplateEvent(
                template_id=uuid.UUID(first["id"]),
                revision_id=None,
                event_type="created",
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
