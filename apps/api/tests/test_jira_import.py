"""Jira CSV import adapter (expansion PLAN Pass 8 PR-T).

Contract (v8.1): deterministic case-insensitive mapping; unknown STATUS
isolates the row while unknown type/priority fall back with notes; missing
Summary header is a request 422 but an empty Summary cell isolates the row;
[KEY] subjects give idempotent re-uploads (duplicates isolated); ignored
columns and unmapped assignees are surfaced in notes."""

import pytest

from app.services.importers import _parse_jira_date
from tests.conftest import create_project

JIRA_CSV = """Issue key,Summary,Issue Type,Status,Priority,Due date,Assignee,Sprint
PROJ-1,로그인 버그,Bug,In Progress,Highest,1/Jul/26,alice,Sprint 3
PROJ-2,대시보드 스토리,Story,To Do,Medium,2026-08-01,bob,Sprint 3
PROJ-3,에픽 항목,Epic,Done,Lowest,,,
PROJ-4,이상 타입,Improvement,Backlog,Trivial,,,
"""


async def import_jira(client, pid, content, dry_run=False):
    return await client.post(
        f"/api/v1/projects/{pid}/work-packages/import/jira",
        json={"content": content, "dry_run": dry_run},
    )


@pytest.fixture
async def project(client):
    return await create_project(client, key="JIRA", name="지라 이관")


def test_date_parser_formats():
    assert _parse_jira_date("2026-07-01") == "2026-07-01"
    assert _parse_jira_date("1/Jul/26") == "2026-07-01"
    assert _parse_jira_date("15/Dec/2026") == "2026-12-15"
    with pytest.raises(ValueError):
        _parse_jira_date("01.07.2026")
    with pytest.raises(ValueError):
        _parse_jira_date("1/Juil/26")  # non-English month → isolate, never guess


async def test_mapping_and_notes(client, project):
    res = await import_jira(client, project["id"], JIRA_CSV)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total_rows"] == 4
    assert body["valid"] == 4
    assert body["inserted"] == 4

    listed = (await client.get(f"/api/v1/projects/{project['id']}/work-packages")).json()
    by_subject = {i["subject"]: i for i in listed["items"]}
    bug = by_subject["[PROJ-1] 로그인 버그"]
    assert (bug["type"], bug["status"], bug["priority"]) == ("bug", "in_progress", "urgent")
    assert bug["due_date"] == "2026-07-01"
    story = by_subject["[PROJ-2] 대시보드 스토리"]
    assert (story["type"], story["status"], story["priority"]) == ("task", "todo", "medium")
    epic = by_subject["[PROJ-3] 에픽 항목"]
    assert (epic["type"], epic["status"], epic["priority"]) == ("feature", "done", "low")
    odd = by_subject["[PROJ-4] 이상 타입"]
    assert (odd["type"], odd["priority"]) == ("task", "none")  # documented fallbacks

    notes = "\n".join(body["notes"])
    assert "Assignee/Reporter 값 2건" in notes
    assert "Issue Type 1건" in notes
    assert "Priority 1건" in notes
    assert "무시된 열" in notes and "Sprint" in notes


async def test_row_isolation_and_header_422(client, project):
    pid = project["id"]
    # Unknown status and a bad date isolate their rows; the good row imports.
    csv_content = (
        "Summary,Status,Due date\n"
        "정상,To Do,\n"
        "이상 상태,Waiting for Customer,\n"
        "이상 날짜,Done,31/Foo/26\n"
        ",To Do,\n"
    )
    res = await import_jira(client, pid, csv_content)
    body = res.json()
    assert body["valid"] == 1
    assert body["invalid"] == 3
    messages = "\n".join(e["message"] for e in body["errors"])
    assert "Status" in messages and "Due date" in messages and "Summary" in messages

    # Missing Summary HEADER is a request-level 422 (not row isolation).
    res = await import_jira(client, pid, "Issue key,Status\nPROJ-9,Done\n")
    assert res.status_code == 422


async def test_idempotent_reupload_isolates_duplicates(client, project):
    pid = project["id"]
    first = await import_jira(client, pid, JIRA_CSV)
    assert first.json()["inserted"] == 4

    again = await import_jira(client, pid, JIRA_CSV)
    body = again.json()
    assert body["valid"] == 0
    assert body["invalid"] == 4
    assert all("이미 가져온" in e["message"] for e in body["errors"])

    # Batch-internal duplicates are isolated too.
    dup_batch = "Issue key,Summary\nNEW-1,같은 제목\nNEW-1,같은 제목\n"
    body = (await import_jira(client, pid, dup_batch)).json()
    assert body["valid"] == 1
    assert body["invalid"] == 1


async def test_dry_run_and_guards(client, project, foreign_project):
    pid = project["id"]
    res = await import_jira(client, pid, JIRA_CSV, dry_run=True)
    body = res.json()
    assert body["dry_run"] is True
    assert body["inserted"] == 0
    listed = (await client.get(f"/api/v1/projects/{pid}/work-packages")).json()
    assert listed["total"] == 0  # nothing persisted

    foreign = str(foreign_project["project_id"])
    assert (await import_jira(client, foreign, JIRA_CSV)).status_code == 404

    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (await import_jira(client, pid, JIRA_CSV)).status_code == 409
    await client.post(f"/api/v1/projects/{pid}/unarchive")


async def test_disabled_type_rows_isolated(client, project):
    pid = project["id"]
    types = (await client.get(f"/api/v1/projects/{pid}/types")).json()["items"]
    bug = next(t for t in types if t["key"] == "bug")
    await client.patch(f"/api/v1/projects/{pid}/types/{bug['id']}", json={"is_active": False})

    body = (await import_jira(client, pid, JIRA_CSV)).json()
    assert body["valid"] == 3
    assert body["invalid"] == 1
    assert any("disabled" in e["message"] for e in body["errors"])


async def test_concurrent_identical_imports_create_once(client, project):
    """Pass 42 PR-BH: the per-project import lock (427008) serializes the
    read-then-write duplicate guard — two concurrent uploads of the SAME file
    converge on one set of rows; the loser's rows all skip as duplicates."""
    import asyncio

    pid = project["id"]
    r1, r2 = await asyncio.gather(
        import_jira(client, pid, JIRA_CSV), import_jira(client, pid, JIRA_CSV)
    )
    assert r1.status_code == 200 and r2.status_code == 200
    created = r1.json()["inserted"] + r2.json()["inserted"]
    assert created == 4  # exactly one file's worth — no duplicates

    listed = (await client.get(f"/api/v1/projects/{pid}/work-packages")).json()
    assert listed["total"] == 4

    # Dry-run takes no lock and never writes — safe alongside anything.
    dry = await import_jira(client, pid, JIRA_CSV, dry_run=True)
    assert dry.json()["inserted"] == 0
    assert (await client.get(f"/api/v1/projects/{pid}/work-packages")).json()["total"] == 4
