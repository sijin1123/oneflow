import asyncio
import uuid

from fastapi import HTTPException
from sqlalchemy import func, select, update

from app.api.v1 import work_item_drafts as draft_routes
from app.models import Activity, ProjectMember, User, WorkItemDraft, WorkPackage
from tests.conftest import create_project


async def _create(client, project_id: str, content: dict | None = None) -> dict:
    body = {} if content is None else {"content": content}
    response = await client.post(f"/api/v1/projects/{project_id}/work-item-drafts", json=body)
    assert response.status_code == 201, response.text
    return response.json()


async def test_work_item_draft_crud_list_order_and_delete(client):
    project = await create_project(client, key="DRF", name="Drafts")
    first = await _create(client, project["id"])
    second = await _create(
        client,
        project["id"],
        {
            "subject": "second",
            "type": "bug",
            "status": "todo",
            "priority": "high",
            "assignee_id": None,
            "due_date": "2026-08-01",
        },
    )
    assert first["content"] == {
        "subject": "",
        "type": "task",
        "status": "backlog",
        "priority": "none",
        "assignee_id": None,
        "due_date": None,
    }

    fetched = await client.get(f"/api/v1/work-item-drafts/{second['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["content"]["due_date"] == "2026-08-01"

    replaced = await client.put(
        f"/api/v1/work-item-drafts/{first['id']}",
        json={
            "expected_version": first["version"],
            "content": {"subject": "first revised", "priority": "urgent"},
        },
    )
    assert replaced.status_code == 200, replaced.text
    first = replaced.json()
    assert first["version"] == 1
    assert first["content"]["subject"] == "first revised"

    listed = await client.get("/api/v1/me/work-item-drafts?limit=1&offset=0")
    assert listed.status_code == 200
    assert listed.json()["total"] == 2
    assert listed.json()["items"][0]["id"] == first["id"]

    deleted = await client.delete(
        f"/api/v1/work-item-drafts/{first['id']}?expected_version={first['version']}"
    )
    assert deleted.status_code == 204
    assert (await client.get(f"/api/v1/work-item-drafts/{first['id']}")).status_code == 404


async def test_work_item_draft_validation_and_concurrent_cas(client):
    project = await create_project(client, key="DVC", name="Draft validation")
    for body in (
        {"content": {"unknown": "value"}},
        {"content": {"subject": "x" * 256}},
        {"content": {"type": "story"}},
        {"content": {"status": "invalid"}},
        {"content": {"priority": "critical"}},
    ):
        response = await client.post(
            f"/api/v1/projects/{project['id']}/work-item-drafts", json=body
        )
        assert response.status_code == 422, (body, response.text)

    draft = await _create(client, project["id"])
    first, second = await asyncio.gather(
        client.put(
            f"/api/v1/work-item-drafts/{draft['id']}",
            json={"expected_version": 0, "content": {"subject": "first"}},
        ),
        client.put(
            f"/api/v1/work-item-drafts/{draft['id']}",
            json={"expected_version": 0, "content": {"subject": "second"}},
        ),
    )
    assert sorted([first.status_code, second.status_code]) == [200, 409]
    winner, loser = (first, second) if first.status_code == 200 else (second, first)
    assert loser.json()["current"]["version"] == 1
    assert loser.json()["current"]["content"] == winner.json()["content"]
    stale_delete = await client.delete(f"/api/v1/work-item-drafts/{draft['id']}?expected_version=0")
    assert stale_delete.status_code == 409


async def test_work_item_draft_cap_is_serialized(client):
    project = await create_project(client, key="DCP", name="Draft cap")
    for index in range(19):
        await _create(client, project["id"], {"subject": f"draft {index}"})

    first, second = await asyncio.gather(
        client.post(f"/api/v1/projects/{project['id']}/work-item-drafts", json={}),
        client.post(f"/api/v1/projects/{project['id']}/work-item-drafts", json={}),
    )
    assert sorted([first.status_code, second.status_code]) == [201, 409]
    listed = await client.get("/api/v1/me/work-item-drafts?limit=50")
    assert listed.json()["total"] == 20


async def test_work_item_draft_owner_role_and_revoked_membership(client, app, dev_user):
    project = await create_project(client, key="DAR", name="Draft access")
    draft = await _create(client, project["id"], {"subject": "private"})

    foreign_id = uuid.uuid4()
    async with app.state.sessionmaker() as session, session.begin():
        foreign_owner = User(email="draft-owner@oneflow.local", display_name="Draft Owner")
        session.add(foreign_owner)
        await session.flush()
        session.add(
            WorkItemDraft(
                id=foreign_id,
                owner_id=foreign_owner.id,
                project_id=uuid.UUID(project["id"]),
                content={"subject": "hidden"},
            )
        )
    assert (await client.get(f"/api/v1/work-item-drafts/{foreign_id}")).status_code == 404
    assert (
        await client.delete(f"/api/v1/work-item-drafts/{foreign_id}?expected_version=0")
    ).status_code == 404

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            update(ProjectMember)
            .where(
                ProjectMember.project_id == uuid.UUID(project["id"]),
                ProjectMember.user_id == dev_user.id,
            )
            .values(role="viewer")
        )
    denied = await client.put(
        f"/api/v1/work-item-drafts/{draft['id']}",
        json={"expected_version": 0, "content": {"subject": "denied"}},
    )
    assert denied.status_code == 403
    assert (
        await client.post(f"/api/v1/projects/{project['id']}/work-item-drafts", json={})
    ).status_code == 403

    async with app.state.sessionmaker() as session, session.begin():
        membership = (
            await session.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == uuid.UUID(project["id"]),
                    ProjectMember.user_id == dev_user.id,
                )
            )
        ).scalar_one()
        await session.delete(membership)
    assert (await client.get("/api/v1/me/work-item-drafts")).json()["total"] == 0
    assert (await client.get(f"/api/v1/work-item-drafts/{draft['id']}")).status_code == 404
    assert (
        await client.put(
            f"/api/v1/work-item-drafts/{draft['id']}",
            json={"expected_version": 0, "content": {"subject": "denied"}},
        )
    ).status_code == 404
    cleaned = await client.delete(f"/api/v1/work-item-drafts/{draft['id']}?expected_version=0")
    assert cleaned.status_code == 204

    async with app.state.sessionmaker() as session:
        assert (
            await session.execute(
                select(WorkItemDraft).where(WorkItemDraft.id == uuid.UUID(draft["id"]))
            )
        ).scalar_one_or_none() is None


async def test_work_item_draft_submit_is_idempotent_and_hides_active_draft(client, app):
    project = await create_project(client, key="DSI", name="Draft submit")
    draft = await _create(
        client,
        project["id"],
        {"subject": "from draft", "status": "todo", "priority": "high"},
    )
    submitted = await client.post(
        f"/api/v1/work-item-drafts/{draft['id']}/submit",
        json={"expected_version": draft["version"]},
    )
    assert submitted.status_code == 200, submitted.text
    work_package = submitted.json()
    assert work_package["subject"] == "from draft"
    assert work_package["status"] == "todo"
    assert (await client.get("/api/v1/me/work-item-drafts")).json()["total"] == 0
    assert (await client.get(f"/api/v1/work-item-drafts/{draft['id']}")).status_code == 404

    retried = await client.post(
        f"/api/v1/work-item-drafts/{draft['id']}/submit",
        json={"expected_version": draft["version"]},
    )
    assert retried.status_code == 200
    assert retried.json()["id"] == work_package["id"]
    async with app.state.sessionmaker() as session:
        assert (
            await session.execute(
                select(func.count()).where(WorkPackage.project_id == uuid.UUID(project["id"]))
            )
        ).scalar_one() == 1
        assert (
            await session.execute(
                select(func.count()).where(
                    Activity.work_package_id == uuid.UUID(work_package["id"]),
                    Activity.action == "created",
                )
            )
        ).scalar_one() == 1


async def test_work_item_draft_concurrent_submit_creates_once(client, app, monkeypatch):
    project = await create_project(client, key="DSC", name="Draft submit race")
    draft = await _create(client, project["id"], {"subject": "one only"})
    original = draft_routes.stage_work_package_create
    stage_calls = 0

    async def count_staging(*args, **kwargs):
        nonlocal stage_calls
        stage_calls += 1
        return await original(*args, **kwargs)

    monkeypatch.setattr(draft_routes, "stage_work_package_create", count_staging)
    first, second = await asyncio.gather(
        client.post(
            f"/api/v1/work-item-drafts/{draft['id']}/submit",
            json={"expected_version": 0},
        ),
        client.post(
            f"/api/v1/work-item-drafts/{draft['id']}/submit",
            json={"expected_version": 0},
        ),
    )
    assert first.status_code == second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert stage_calls == 1
    async with app.state.sessionmaker() as session:
        assert (
            await session.execute(
                select(func.count()).where(WorkPackage.project_id == uuid.UUID(project["id"]))
            )
        ).scalar_one() == 1


async def test_work_item_draft_submit_validation_and_atomic_rollback(client, app, monkeypatch):
    project = await create_project(client, key="DSR", name="Draft submit rollback")
    blank = await _create(client, project["id"])
    rejected = await client.post(
        f"/api/v1/work-item-drafts/{blank['id']}/submit",
        json={"expected_version": 0},
    )
    assert rejected.status_code == 422
    assert (await client.get("/api/v1/me/work-item-drafts")).json()["total"] == 1

    draft = await _create(client, project["id"], {"subject": "must roll back"})
    original = draft_routes.stage_work_package_create

    async def fail_after_staging(*args, **kwargs):
        await original(*args, **kwargs)
        raise HTTPException(status_code=500, detail="forced rollback")

    monkeypatch.setattr(draft_routes, "stage_work_package_create", fail_after_staging)
    failed = await client.post(
        f"/api/v1/work-item-drafts/{draft['id']}/submit",
        json={"expected_version": 0},
    )
    assert failed.status_code == 500
    async with app.state.sessionmaker() as session:
        assert (
            await session.execute(
                select(func.count()).where(WorkPackage.project_id == uuid.UUID(project["id"]))
            )
        ).scalar_one() == 0
        persisted = (
            await session.execute(
                select(WorkItemDraft).where(WorkItemDraft.id == uuid.UUID(draft["id"]))
            )
        ).scalar_one()
        assert persisted.submitted_at is None
        assert persisted.version == 0
