"""Jira CSV import adapter (expansion PLAN Pass 8 PR-T).

Contract (v8.1): deterministic case-insensitive mapping; unknown STATUS
isolates the row while unknown type/priority fall back with notes; missing
Summary header is a request 422 but an empty Summary cell isolates the row;
[KEY] subjects give idempotent re-uploads (duplicates isolated); ignored
columns and unmapped assignees are surfaced in notes."""

import uuid

import pytest

from app.models.member import ProjectMember
from app.models.user import User
from app.services.importers import _parse_jira_date
from tests.conftest import create_project

JIRA_CSV = """Issue key,Summary,Issue Type,Status,Priority,Due date,Assignee,Sprint
PROJ-1,로그인 버그,Bug,In Progress,Highest,1/Jul/26,alice,Sprint 3
PROJ-2,대시보드 스토리,Story,To Do,Medium,2026-08-01,bob,Sprint 3
PROJ-3,에픽 항목,Epic,Done,Lowest,,,
PROJ-4,이상 타입,Improvement,Backlog,Trivial,,,
"""


async def import_jira(
    client,
    pid,
    content,
    dry_run=False,
    *,
    mappings=None,
    preview_checksum=None,
):
    if not dry_run and preview_checksum is None:
        preview = await import_jira(client, pid, content, dry_run=True)
        if preview.status_code != 200:
            return preview
        preview_body = preview.json()
        preview_checksum = preview_body["preview_checksum"]
        mappings = [
            {"source_value": item["source_value"], "user_id": None}
            for item in preview_body["assignee_identities"]
        ]
    return await client.post(
        f"/api/v1/projects/{pid}/work-packages/import/jira",
        json={
            "content": content,
            "dry_run": dry_run,
            **({"preview_checksum": preview_checksum} if preview_checksum else {}),
            **({"assignee_mappings": mappings} if mappings is not None else {}),
        },
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
    assert "담당자 매핑으로 0건을 배정하고 2건의 원본 담당자 값을 미배정" in notes
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


async def test_assignee_preview_requires_explicit_mapping_and_assigns_exact_email(
    client, project, dev_user
):
    pid = project["id"]
    content = (
        "Issue key,Summary,Status,Assignee\n"
        "MAP-1,담당자 정확 매칭,To Do,dev@oneflow.local\n"
        "MAP-2,담당자 반복,In Progress,DEV@ONEFLOW.LOCAL\n"
    )
    preview = await import_jira(client, pid, content, dry_run=True)
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["assignee_identities"] == [
        {
            "source_value": "dev@oneflow.local",
            "row_count": 2,
            "suggested_user_id": str(dev_user.id),
            "suggested_display_name": "Dev User",
            "suggested_email": "dev@oneflow.local",
            "selected_user_id": None,
            "selected_display_name": None,
        }
    ]
    assert body["assignable_members"] == [
        {
            "user_id": str(dev_user.id),
            "email": "dev@oneflow.local",
            "display_name": "Dev User",
            "role": "owner",
        }
    ]

    missing = await client.post(
        f"/api/v1/projects/{pid}/work-packages/import/jira",
        json={
            "content": content,
            "dry_run": False,
            "preview_checksum": body["preview_checksum"],
        },
    )
    assert missing.status_code == 422

    stale = await import_jira(
        client,
        pid,
        content,
        mappings=[{"source_value": "dev@oneflow.local", "user_id": str(dev_user.id)}],
        preview_checksum="0" * 64,
    )
    assert stale.status_code == 409

    committed = await import_jira(
        client,
        pid,
        content,
        mappings=[{"source_value": "dev@oneflow.local", "user_id": str(dev_user.id)}],
        preview_checksum=body["preview_checksum"],
    )
    assert committed.status_code == 200, committed.text
    assert committed.json()["inserted"] == 2
    assert committed.json()["assignee_identities"][0]["selected_user_id"] == str(dev_user.id)

    listed = (await client.get(f"/api/v1/projects/{pid}/work-packages")).json()
    assert {item["assignee_id"] for item in listed["items"]} == {str(dev_user.id)}


async def test_assignee_mapping_rejects_viewer_and_inactive_members(client, project, app):
    pid = project["id"]
    async with app.state.sessionmaker() as session, session.begin():
        viewer = User(email="viewer-map@example.com", display_name="Viewer Map")
        inactive = User(
            email="inactive-map@example.com",
            display_name="Inactive Map",
            is_active=False,
        )
        session.add_all([viewer, inactive])
        await session.flush()
        session.add_all(
            [
                ProjectMember(project_id=uuid.UUID(pid), user_id=viewer.id, role="viewer"),
                ProjectMember(project_id=uuid.UUID(pid), user_id=inactive.id, role="member"),
            ]
        )
        viewer_id = viewer.id
        inactive_id = inactive.id

    content = (
        "Summary,Assignee\n"
        "뷰어 사용자,viewer-map@example.com\n"
        "비활성 사용자,inactive-map@example.com\n"
    )
    preview = (await import_jira(client, pid, content, dry_run=True)).json()
    assert all(item["suggested_user_id"] is None for item in preview["assignee_identities"])
    candidate_ids = {item["user_id"] for item in preview["assignable_members"]}
    assert str(viewer_id) not in candidate_ids
    assert str(inactive_id) not in candidate_ids

    for source_value, user_id in (
        ("viewer-map@example.com", viewer_id),
        ("inactive-map@example.com", inactive_id),
    ):
        mappings = [
            {"source_value": item["source_value"], "user_id": None}
            for item in preview["assignee_identities"]
        ]
        next(item for item in mappings if item["source_value"] == source_value)["user_id"] = str(
            user_id
        )
        rejected = await import_jira(
            client,
            pid,
            content,
            mappings=mappings,
            preview_checksum=preview["preview_checksum"],
        )
        assert rejected.status_code == 422
        assert "active project owner or member" in rejected.json()["detail"]


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
