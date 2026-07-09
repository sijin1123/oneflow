"""Project archive lifecycle (expansion PLAN Pass 2 PR-G).

Contract: owner-only idempotent archive/restore; archived projects are
read-only (project-scoped writes 409, reads/exports 200); default list hides
archived (include_archived reveals); /me/work and search rest quietly."""

import pytest

from tests.conftest import create_project, create_wp


@pytest.fixture
async def archived(client):
    project = await create_project(client, key="ARC", name="보관 프로젝트")
    wp = await create_wp(client, project["id"], subject="보관 전 작업", assignee_id=None)
    res = await client.post(f"/api/v1/projects/{project['id']}/archive")
    assert res.status_code == 200, res.text
    assert res.json()["archived_at"] is not None
    return {"project": project, "wp": wp}


async def test_archive_is_owner_only_and_idempotent(client, member_project, foreign_project):
    shared = str(member_project["project_id"])
    assert (await client.post(f"/api/v1/projects/{shared}/archive")).status_code == 403
    foreign = str(foreign_project["project_id"])
    assert (await client.post(f"/api/v1/projects/{foreign}/archive")).status_code == 404

    # Idempotent on own project.
    project = await create_project(client, key="IDM", name="멱등")
    first = await client.post(f"/api/v1/projects/{project['id']}/archive")
    second = await client.post(f"/api/v1/projects/{project['id']}/archive")
    assert first.status_code == second.status_code == 200
    assert first.json()["archived_at"] == second.json()["archived_at"]


async def test_archived_project_is_read_only(client, archived):
    pid = archived["project"]["id"]
    wp = archived["wp"]

    # Representative writes across guard paths → 409.
    res = await client.post(f"/api/v1/projects/{pid}/work-packages", json={"subject": "새 작업"})
    assert res.status_code == 409
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 0, "status": "todo"}
    )
    assert res.status_code == 409
    res = await client.post(f"/api/v1/work-packages/{wp['id']}/comments", json={"body": "댓글"})
    assert res.status_code == 409
    res = await client.post(f"/api/v1/projects/{pid}/milestones", json={"name": "보관 중 마일스톤"})
    assert res.status_code == 409
    res = await client.patch(f"/api/v1/projects/{pid}", json={"name": "이름 변경 시도"})
    assert res.status_code == 409

    # Reads and export stay open.
    assert (await client.get(f"/api/v1/projects/{pid}/work-packages")).status_code == 200
    assert (await client.get(f"/api/v1/projects/{pid}/dashboard")).status_code == 200
    assert (await client.get(f"/api/v1/projects/{pid}/work-packages/export.csv")).status_code == 200


async def test_restore_reopens_writes(client, archived):
    pid = archived["project"]["id"]
    res = await client.post(f"/api/v1/projects/{pid}/unarchive")
    assert res.status_code == 200
    assert res.json()["archived_at"] is None

    res = await client.post(f"/api/v1/projects/{pid}/work-packages", json={"subject": "복원 후"})
    assert res.status_code == 201


async def test_list_hides_archived_by_default(client, archived):
    pid = archived["project"]["id"]
    default = (await client.get("/api/v1/projects")).json()
    assert all(p["id"] != pid for p in default["items"])

    included = (await client.get("/api/v1/projects", params={"include_archived": "true"})).json()
    row = next(p for p in included["items"] if p["id"] == pid)
    assert row["archived_at"] is not None


async def test_my_work_and_search_rest_quietly(client, archived):
    me = (await client.get("/api/v1/me")).json()["id"]
    pid = archived["project"]["id"]
    # Restore briefly to assign, then re-archive: the assignment must vanish
    # from /me/work and search while archived.
    await client.post(f"/api/v1/projects/{pid}/unarchive")
    wp = archived["wp"]
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "assignee_id": me},
    )
    assert res.status_code == 200, res.text
    await client.post(f"/api/v1/projects/{pid}/archive")

    body = (await client.get("/api/v1/me/work")).json()
    assert all(i["project_id"] != pid for i in body["assigned_to_me"])
    assert all(a["project_id"] != pid for a in body["recent_activity"])

    res = await client.get("/api/v1/search/work-packages", params={"q": "보관 전"})
    assert res.json()["total"] == 0
    res = await client.get("/api/v1/search/work-packages")
    assert all(i["project_id"] != pid for i in res.json()["items"])
