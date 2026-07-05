"""Per-project workflow status configuration (PLAN §3 Phase 3)."""

import uuid

import pytest
from sqlalchemy import select

from app.models import ProjectMember
from tests.conftest import create_project


@pytest.fixture
async def project(client):
    return await create_project(client, key="WF", name="워크플로우")


async def test_new_project_is_seeded_with_default_statuses(client, project):
    res = await client.get(f"/api/v1/projects/{project['id']}/statuses")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 6
    keys = [s["key"] for s in body["items"]]
    # returned in configured order
    assert keys == ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]
    assert body["items"][0]["name"] == "백로그"


async def test_owner_can_rename_and_reorder(client, project):
    pid = project["id"]
    statuses = (await client.get(f"/api/v1/projects/{pid}/statuses")).json()["items"]
    review = next(s for s in statuses if s["key"] == "in_review")

    res = await client.patch(
        f"/api/v1/projects/{pid}/statuses/{review['id']}",
        json={"name": "QA 검수", "position": 1},
    )
    assert res.status_code == 200
    assert res.json()["name"] == "QA 검수"

    # reorder reflected on next list
    reordered = (await client.get(f"/api/v1/projects/{pid}/statuses")).json()["items"]
    qa = next(s for s in reordered if s["key"] == "in_review")
    assert qa["position"] == 1
    assert qa["name"] == "QA 검수"


async def test_rename_requires_owner_role(client, app, project):
    pid = project["id"]
    statuses = (await client.get(f"/api/v1/projects/{pid}/statuses")).json()["items"]
    sid = statuses[0]["id"]

    # demote the dev user to a plain member for this project
    me = (await client.get("/api/v1/me")).json()
    async with app.state.sessionmaker() as session, session.begin():
        row = (
            await session.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == uuid.UUID(pid),
                    ProjectMember.user_id == uuid.UUID(me["id"]),
                )
            )
        ).scalar_one()
        row.role = "member"

    res = await client.patch(f"/api/v1/projects/{pid}/statuses/{sid}", json={"name": "X"})
    assert res.status_code == 403  # member but not owner


async def test_statuses_are_member_scoped(client, foreign_project):
    pid = foreign_project["project_id"]
    assert (await client.get(f"/api/v1/projects/{pid}/statuses")).status_code == 404


async def test_update_unknown_status_404(client, project):
    pid = project["id"]
    missing = "00000000-0000-4000-8000-000000000000"
    assert (
        await client.patch(f"/api/v1/projects/{pid}/statuses/{missing}", json={"name": "X"})
    ).status_code == 404


async def test_invalid_name_rejected(client, project):
    pid = project["id"]
    sid = (await client.get(f"/api/v1/projects/{pid}/statuses")).json()["items"][0]["id"]
    assert (
        await client.patch(f"/api/v1/projects/{pid}/statuses/{sid}", json={"name": "   "})
    ).status_code == 422
