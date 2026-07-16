"""Linear CSV import adapter (expansion PLAN Pass 25 PR-AQ).

Contract (v25.1): official-export columns; custom statuses isolate their row;
Estimate is a POINT scale — never injected, only counted in notes; blank Due
Date is a normal omission (ISO date otherwise, else isolate); [ID] Title
subjects give idempotent re-uploads via the shared duplicate guard; the
response shape is identical to the Jira adapter."""

import pytest

from tests.conftest import create_project

LINEAR_CSV = """ID,Title,Status,Priority,Due Date,Estimate,Assignee,Labels
ABC-1,로그인 버그,In Progress,Urgent,2026-07-10,3,kim,auth
ABC-2,대시보드 개선,Todo,No priority,,,lee,ui
ABC-3,취소된 항목,Canceled,Low,,,,
"""


async def import_linear(
    client,
    pid,
    content,
    dry_run=False,
    *,
    mappings=None,
    preview_checksum=None,
):
    if not dry_run and preview_checksum is None:
        preview = await import_linear(client, pid, content, dry_run=True)
        if preview.status_code != 200:
            return preview
        preview_body = preview.json()
        preview_checksum = preview_body["preview_checksum"]
        mappings = [
            {"source_value": item["source_value"], "user_id": None}
            for item in preview_body["assignee_identities"]
        ]
    return await client.post(
        f"/api/v1/projects/{pid}/work-packages/import/linear",
        json={
            "content": content,
            "dry_run": dry_run,
            **({"preview_checksum": preview_checksum} if preview_checksum else {}),
            **({"assignee_mappings": mappings} if mappings is not None else {}),
        },
    )


@pytest.fixture
async def project(client):
    return await create_project(client, key="LNR", name="리니어 이관")


async def test_mapping_and_notes(client, project):
    res = await import_linear(client, project["id"], LINEAR_CSV)
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["total_rows"], body["valid"], body["inserted"]) == (3, 3, 3)

    listed = (await client.get(f"/api/v1/projects/{project['id']}/work-packages")).json()
    by_subject = {i["subject"]: i for i in listed["items"]}
    bug = by_subject["[ABC-1] 로그인 버그"]
    assert (bug["type"], bug["status"], bug["priority"]) == ("task", "in_progress", "urgent")
    assert bug["due_date"] == "2026-07-10"
    assert bug["estimated_hours"] is None  # points never become hours
    todo = by_subject["[ABC-2] 대시보드 개선"]
    assert (todo["status"], todo["priority"], todo["due_date"]) == ("todo", "none", None)
    assert by_subject["[ABC-3] 취소된 항목"]["status"] == "cancelled"

    notes = "\n".join(body["notes"])
    assert "담당자 매핑으로 0건을 배정하고 2건의 원본 담당자 값을 미배정" in notes
    assert "Estimate 1건" in notes and "포인트" in notes
    assert "무시된 열" in notes and "Labels" in notes


async def test_custom_status_isolated_and_header_422(client, project):
    pid = project["id"]
    csv_content = "Title,Status\n정상,Todo\n커스텀,Waiting for QA\n"
    body = (await import_linear(client, pid, csv_content)).json()
    assert (body["valid"], body["invalid"]) == (1, 1)
    assert "Status" in body["errors"][0]["message"]

    # Bad due date isolates; blank due date is a normal omission (tested above).
    body = (await import_linear(client, pid, "Title,Due Date\n이상 날짜,10/07/2026\n")).json()
    assert body["invalid"] == 1

    assert (await import_linear(client, pid, "ID,Status\nABC-9,Todo\n")).status_code == 422


async def test_idempotent_reupload_and_guards(client, project, foreign_project):
    pid = project["id"]
    assert (await import_linear(client, pid, LINEAR_CSV)).json()["inserted"] == 3
    again = (await import_linear(client, pid, LINEAR_CSV)).json()
    assert (again["valid"], again["invalid"]) == (0, 3)
    assert all("이미 가져온" in e["message"] for e in again["errors"])

    foreign_pid = str(foreign_project["project_id"])
    assert (await import_linear(client, foreign_pid, LINEAR_CSV)).status_code == 404
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (await import_linear(client, pid, LINEAR_CSV)).status_code == 409
    await client.post(f"/api/v1/projects/{pid}/unarchive")
