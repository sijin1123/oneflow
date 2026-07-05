"""CSV export/import (PLAN §3 Phase 2 — dry-run·대사·실패 행 격리·재처리)."""

import pytest

from tests.conftest import create_project, create_wp


@pytest.fixture
async def project(client):
    return await create_project(client, key="CSV", name="CSV")


async def test_export_is_member_scoped(client, foreign_project):
    # non-member → 404 existence hiding (same contract as list/get)
    res = await client.get(
        f"/api/v1/projects/{foreign_project['project_id']}/work-packages/export.csv"
    )
    assert res.status_code == 404


async def test_export_headers_and_body(client, project):
    pid = project["id"]
    await create_wp(client, pid, subject="첫 작업", priority="high", estimated_hours=3)
    await create_wp(client, pid, subject="둘째 작업", status="todo")

    res = await client.get(f"/api/v1/projects/{pid}/work-packages/export.csv")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert res.headers["x-oneflow-row-count"] == "2"
    assert res.headers["x-oneflow-checksum"]  # non-empty
    assert "attachment" in res.headers["content-disposition"]

    lines = res.text.strip().splitlines()
    expected_header = "subject,description,type,status,priority,start_date,due_date,estimated_hours"
    assert lines[0] == expected_header
    assert "첫 작업" in res.text and "둘째 작업" in res.text


async def test_import_dry_run_writes_nothing(client, project):
    pid = project["id"]
    content = "subject,priority\n계획 A,high\n계획 B,low\n"
    res = await client.post(
        f"/api/v1/projects/{pid}/work-packages/import",
        json={"content": content, "dry_run": True},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["dry_run"] is True
    assert body["total_rows"] == 2
    assert body["valid"] == 2
    assert body["invalid"] == 0
    assert body["inserted"] == 0
    assert body["checksum"]

    # nothing persisted
    listed = (await client.get(f"/api/v1/projects/{pid}/work-packages")).json()
    assert listed["total"] == 0


async def test_import_commit_inserts_valid_rows(client, project):
    pid = project["id"]
    content = "subject,type,status\n실제 작업,bug,in_progress\n"
    res = await client.post(
        f"/api/v1/projects/{pid}/work-packages/import",
        json={"content": content, "dry_run": False},
    )
    body = res.json()
    assert body["inserted"] == 1

    listed = (await client.get(f"/api/v1/projects/{pid}/work-packages")).json()
    assert listed["total"] == 1
    wp = listed["items"][0]
    assert wp["subject"] == "실제 작업"
    assert wp["type"] == "bug"
    assert wp["status"] == "in_progress"


async def test_bad_rows_isolated_good_rows_commit(client, project):
    pid = project["id"]
    # row 1 ok, row 2 bad status, row 3 empty subject, row 4 ok
    content = "subject,status\n좋은 행1,todo\n나쁜 상태,not_a_status\n,done\n좋은 행2,in_review\n"
    res = await client.post(
        f"/api/v1/projects/{pid}/work-packages/import",
        json={"content": content, "dry_run": False},
    )
    body = res.json()
    assert body["total_rows"] == 4
    assert body["valid"] == 2
    assert body["invalid"] == 2
    assert body["inserted"] == 2
    # error rows carry their 1-based number and the re-serialized raw line (재처리)
    bad_rows = {e["row"] for e in body["errors"]}
    assert bad_rows == {2, 3}
    assert any("나쁜 상태" in e["raw"] for e in body["errors"])

    listed = (await client.get(f"/api/v1/projects/{pid}/work-packages")).json()
    assert listed["total"] == 2


async def test_missing_subject_header_rejected(client, project):
    pid = project["id"]
    res = await client.post(
        f"/api/v1/projects/{pid}/work-packages/import",
        json={"content": "type,status\ntask,todo\n", "dry_run": True},
    )
    assert res.status_code == 422


async def test_round_trip_checksum_matches(client, project):
    pid = project["id"]
    await create_wp(client, pid, subject="왕복 A", priority="high")
    await create_wp(client, pid, subject="왕복 B", description="설명")

    exported = await client.get(f"/api/v1/projects/{pid}/work-packages/export.csv")
    export_checksum = exported.headers["x-oneflow-checksum"]

    # feed the export straight back as a dry-run — same scalar data, same checksum (대사)
    res = await client.post(
        f"/api/v1/projects/{pid}/work-packages/import",
        json={"content": exported.text, "dry_run": True},
    )
    body = res.json()
    assert body["total_rows"] == 2
    assert body["valid"] == 2
    assert body["checksum"] == export_checksum


async def test_import_is_member_scoped(client, foreign_project):
    res = await client.post(
        f"/api/v1/projects/{foreign_project['project_id']}/work-packages/import",
        json={"content": "subject\nx\n", "dry_run": True},
    )
    assert res.status_code == 404
