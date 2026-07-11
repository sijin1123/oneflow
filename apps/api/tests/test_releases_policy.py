"""Workspace Releases policy and milestone-derived surface enforcement."""

from sqlalchemy import func, select

from app.models.milestone import Milestone
from app.models.saved_filter import SavedFilter
from app.models.work_package import WorkPackage
from tests.conftest import create_project, create_wp


async def set_releases(client, enabled: bool, revision: int = 1):
    return await client.patch(
        "/api/v1/admin/workspace/features/releases",
        json={"enabled": enabled},
        headers={"If-Match": f'"{revision}"'},
    )


async def test_disabled_releases_hide_and_preserve_milestone_surfaces(client, app):
    project = await create_project(client, key="RPOL", name="Release policy")
    target = await create_project(client, key="RPOL2", name="Move target")
    pid = project["id"]
    milestone = (
        await client.post(
            f"/api/v1/projects/{pid}/milestones",
            json={"name": "2026 Q3 release", "due_date": "2026-09-30"},
        )
    ).json()
    work = await create_wp(client, pid, subject="Release work", milestone_id=milestone["id"])
    unassigned = await create_wp(client, pid, subject="Unassigned work")
    saved = (
        await client.post(
            f"/api/v1/projects/{pid}/saved-filters",
            json={"name": "Release view", "params": {"milestone_id": milestone["id"]}},
        )
    ).json()
    before_timeline = await client.get("/api/v1/reports/portfolio/timeline")
    project_lane = next(
        item for item in before_timeline.json()["items"] if item["project_id"] == pid
    )
    assert project_lane["milestones"][0]["id"] == milestone["id"]

    disabled = await set_releases(client, False)
    assert disabled.status_code == 200
    assert disabled.headers["etag"] == '"2"'

    milestone_calls = [
        await client.get(f"/api/v1/projects/{pid}/milestones"),
        await client.post(f"/api/v1/projects/{pid}/milestones", json={"name": "Blocked"}),
        await client.patch(
            f"/api/v1/projects/{pid}/milestones/{milestone['id']}",
            json={"name": "Blocked"},
        ),
        await client.delete(f"/api/v1/projects/{pid}/milestones/{milestone['id']}"),
    ]
    assert {response.status_code for response in milestone_calls} == {404}
    assert {response.json()["detail"] for response in milestone_calls} == {"not found"}

    listed = await client.get(f"/api/v1/projects/{pid}/work-packages")
    assert listed.json()["items"][0]["milestone_id"] is None
    detail = await client.get(f"/api/v1/work-packages/{work['id']}")
    assert detail.json()["milestone_id"] is None
    assert (
        await client.get(
            f"/api/v1/projects/{pid}/work-packages",
            params={"milestone_id": milestone["id"]},
        )
    ).status_code == 404
    assert (
        await client.post(
            f"/api/v1/projects/{pid}/work-packages",
            json={"subject": "Blocked", "milestone_id": milestone["id"]},
        )
    ).status_code == 404
    assert (
        await client.patch(
            f"/api/v1/work-packages/{work['id']}",
            json={"expected_version": work["version"], "milestone_id": None},
        )
    ).status_code == 404

    duplicated = await client.post(f"/api/v1/work-packages/{work['id']}/duplicate")
    assert duplicated.status_code == 201
    assert duplicated.json()["work_package"]["milestone_id"] is None
    moved = await client.post(
        f"/api/v1/work-packages/{work['id']}/move",
        json={
            "target_project_id": target["id"],
            "expected_version": work["version"],
            "dry_run": True,
        },
    )
    assert moved.status_code == 404
    unassigned_move = await client.post(
        f"/api/v1/work-packages/{unassigned['id']}/move",
        json={
            "target_project_id": target["id"],
            "expected_version": unassigned["version"],
            "dry_run": True,
        },
    )
    assert unassigned_move.status_code == 404

    views = await client.get(f"/api/v1/projects/{pid}/saved-filters")
    assert views.json() == {"items": [], "total": 0}
    assert (
        await client.post(
            f"/api/v1/projects/{pid}/saved-filters",
            json={"name": "Blocked view", "params": {"milestone_id": milestone["id"]}},
        )
    ).status_code == 404
    assert (
        await client.patch(
            f"/api/v1/projects/{pid}/saved-filters/{saved['id']}", json={"name": "Blocked"}
        )
    ).status_code == 404
    assert (
        await client.delete(f"/api/v1/projects/{pid}/saved-filters/{saved['id']}")
    ).status_code == 404

    hidden_timeline = await client.get("/api/v1/reports/portfolio/timeline")
    project_lane = next(
        item for item in hidden_timeline.json()["items"] if item["project_id"] == pid
    )
    assert project_lane["milestones"] == []

    async with app.state.sessionmaker() as session:
        assert await session.scalar(select(func.count()).select_from(Milestone)) == 1
        assert await session.scalar(select(func.count()).select_from(SavedFilter)) == 1
        original = await session.get(WorkPackage, work["id"])
        duplicate = await session.get(WorkPackage, duplicated.json()["work_package"]["id"])
        assert str(original.milestone_id) == milestone["id"]
        assert duplicate.milestone_id is None
        assert str(original.project_id) == pid

    restored = await set_releases(client, True, revision=2)
    assert restored.status_code == 200
    assert (await client.get(f"/api/v1/work-packages/{work['id']}")).json()[
        "milestone_id"
    ] == milestone["id"]
    assert (await client.get(f"/api/v1/projects/{pid}/milestones")).json()["total"] == 1
    assert (await client.get(f"/api/v1/projects/{pid}/saved-filters")).json()["total"] == 1
