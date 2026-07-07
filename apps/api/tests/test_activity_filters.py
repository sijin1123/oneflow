"""Activity feed filters/ordering (expansion PLAN Pass 19 PR-AK).

Contract (v19.1): action (closed set, 422 outside) and field (exact key,
trimmed) compose as independent ANDs — a field filter with action=created is a
legitimately empty page; ordering flips with a deterministic id tie-breaker;
project-feed `total` stays the returned count with an additive `truncated`
probe; there is deliberately NO actor filter (the read model hides actor ids)."""

import pytest

from tests.conftest import create_project, create_wp


@pytest.fixture
async def seeded(client):
    """One WP with a created + field_changed(status) + commented history."""
    project = await create_project(client, key="ACTF", name="활동 필터 프로젝트")
    wp = await create_wp(client, project["id"], subject="필터 대상")
    await client.patch(
        f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 0, "status": "in_progress"}
    )
    await client.post(f"/api/v1/work-packages/{wp['id']}/comments", json={"body": "확인"})
    return {"pid": project["id"], "wp_id": wp["id"]}


async def test_wp_activity_filters_and_order(client, seeded):
    wp_id = seeded["wp_id"]
    base = f"/api/v1/work-packages/{wp_id}/activities"

    all_items = (await client.get(base)).json()
    assert all_items["total"] == 3  # created + field_changed + commented

    only_changed = (await client.get(f"{base}?action=field_changed")).json()
    assert only_changed["total"] == 1
    assert only_changed["items"][0]["field"] == "status"

    by_field = (await client.get(f"{base}?field=status")).json()
    assert by_field["total"] == 1

    # Independent ANDs: created rows have no field → legitimately empty.
    empty = (await client.get(f"{base}?action=created&field=status")).json()
    assert empty["total"] == 0
    assert (await client.get(f"{base}?action=nope")).status_code == 422

    asc = [a["action"] for a in (await client.get(f"{base}?order=asc")).json()["items"]]
    desc = [a["action"] for a in (await client.get(f"{base}?order=desc")).json()["items"]]
    assert asc == list(reversed(desc))
    assert asc[0] == "created"  # default asc preserved


async def test_project_feed_filters_truncated_and_scope(client, seeded, foreign_project):
    pid = seeded["pid"]
    base = f"/api/v1/projects/{pid}/activities"

    feed = (await client.get(base)).json()
    assert feed["total"] == 3
    assert feed["truncated"] is False
    # Default desc preserved: newest (commented) first.
    assert feed["items"][0]["action"] == "commented"

    only_comments = (await client.get(f"{base}?action=commented")).json()
    assert [a["action"] for a in only_comments["items"]] == ["commented"]

    # limit+1 probe: with limit=1 there are more rows behind.
    probe = (await client.get(f"{base}?limit=1")).json()
    assert (probe["total"], probe["truncated"]) == (1, True)

    asc = (await client.get(f"{base}?order=asc")).json()
    assert asc["items"][0]["action"] == "created"

    assert (await client.get(f"{base}?action=nope")).status_code == 422
    foreign_pid = str(foreign_project["project_id"])
    assert (await client.get(f"/api/v1/projects/{foreign_pid}/activities")).status_code == 404
