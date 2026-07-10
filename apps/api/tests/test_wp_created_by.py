"""work_packages.created_by (expansion PLAN Pass 12 PR-Z).

Contract (v12.1): every creation path records the acting user; pre-0033 rows
stay null (schema allows it); the column is read-only surface (no PATCH)."""

from tests.conftest import create_project, create_wp

JIRA_CSV = "Summary\n지라 생성 확인\n"
CSV = "subject\n직접 CSV 생성\n"


async def _me(client) -> str:
    return (await client.get("/api/v1/me")).json()["id"]


async def test_direct_create_records_author(client):
    project = await create_project(client, key="AUTH", name="작성자")
    wp = await create_wp(client, project["id"], subject="직접 생성")
    assert wp["created_by"] == await _me(client)


async def test_import_paths_record_author(client):
    project = await create_project(client, key="AUTH2", name="작성자2")
    pid = project["id"]
    me = await _me(client)

    await client.post(
        f"/api/v1/projects/{pid}/work-packages/import", json={"content": CSV, "dry_run": False}
    )
    await client.post(
        f"/api/v1/projects/{pid}/work-packages/import/jira",
        json={"content": JIRA_CSV, "dry_run": False},
    )
    listed = (await client.get(f"/api/v1/projects/{pid}/work-packages")).json()
    assert len(listed["items"]) == 2
    assert all(i["created_by"] == me for i in listed["items"])


async def test_intake_accept_records_author(client):
    project = await create_project(client, key="AUTH3", name="작성자3")
    pid = project["id"]
    item = (
        await client.post(f"/api/v1/projects/{pid}/intake", json={"title": "인테이크 제안"})
    ).json()
    res = await client.post(
        f"/api/v1/projects/{pid}/intake/{item['id']}/triage", json={"status": "accepted"}
    )
    assert res.status_code == 200, res.text
    listed = (await client.get(f"/api/v1/projects/{pid}/work-packages")).json()
    assert listed["items"][0]["created_by"] == await _me(client)


async def test_action_item_convert_records_author(client):
    project = await create_project(client, key="AUTH4", name="작성자4")
    pid = project["id"]
    meeting = (
        await client.post(
            f"/api/v1/projects/{pid}/meetings",
            json={"title": "회의", "scheduled_at": "2026-07-10T10:00:00Z"},
        )
    ).json()
    action = (
        await client.post(
            f"/api/v1/meetings/{meeting['id']}/action-items",
            json={"description": "전환될 액션"},
        )
    ).json()
    res = await client.post(f"/api/v1/action-items/{action['id']}/convert")
    assert res.status_code == 200, res.text
    listed = (await client.get(f"/api/v1/projects/{pid}/work-packages")).json()
    assert listed["items"][0]["created_by"] == await _me(client)
