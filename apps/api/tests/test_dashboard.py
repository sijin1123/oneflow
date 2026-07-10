"""Project dashboard aggregation (PLAN §3 Phase 3 reporting)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.models import ProjectMember, User, WorkPackage
from tests.conftest import create_project, create_wp


@pytest.fixture
async def project(client):
    return await create_project(client, key="DASH", name="대시보드")


async def test_dashboard_counts_and_overdue(client, project):
    pid = project["id"]
    await create_wp(client, pid, subject="a", status="todo", priority="high")
    await create_wp(client, pid, subject="b", status="done", priority="low")
    # overdue: due in the past, still open
    await create_wp(client, pid, subject="c", status="in_progress", due_date="2020-01-01")
    # done-but-past is NOT overdue
    await create_wp(client, pid, subject="d", status="done", due_date="2020-01-01")

    d = (await client.get(f"/api/v1/projects/{pid}/dashboard")).json()
    assert d["total_work_packages"] == 4
    assert d["open_work_packages"] == 2  # todo + in_progress (done x2 excluded)
    assert d["completion_percent"] == 50.0
    assert d["overdue_count"] == 1  # only the open past-due one
    status = {b["key"]: b["count"] for b in d["status_counts"]}
    assert status["todo"] == 1 and status["done"] == 2 and status["in_progress"] == 1
    # every enum key is present (ordered, zero-filled)
    assert len(d["status_counts"]) == 6


async def test_dashboard_hours_rollup(client, project):
    pid = project["id"]
    wp = await create_wp(client, pid, subject="h", estimated_hours=10)
    await client.post(
        f"/api/v1/work-packages/{wp['id']}/time-entries",
        json={"hours": 3, "spent_on": "2026-07-01"},
    )
    await client.post(
        f"/api/v1/work-packages/{wp['id']}/time-entries",
        json={"hours": 2.5, "spent_on": "2026-07-02"},
    )
    d = (await client.get(f"/api/v1/projects/{pid}/dashboard")).json()
    assert d["total_estimated_hours"] == 10.0
    assert d["total_spent_hours"] == 5.5


async def test_dashboard_empty_project(client, project):
    d = (await client.get(f"/api/v1/projects/{project['id']}/dashboard")).json()
    assert d["total_work_packages"] == 0
    assert d["completion_percent"] == 0.0
    assert d["overdue_count"] == 0
    assert d["total_estimated_hours"] == 0.0
    assert d["total_spent_hours"] == 0.0


async def test_dashboard_exposes_project_metadata_and_archived_projects_remain_readable(
    client, project
):
    pid = project["id"]
    updated = await client.patch(
        f"/api/v1/projects/{pid}",
        json={"description": "프로젝트 개요", "health": "at_risk", "health_note": "일정 지연"},
    )
    assert updated.status_code == 200, updated.text
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200

    dashboard = (await client.get(f"/api/v1/projects/{pid}/dashboard")).json()
    assert {
        key: dashboard[key] for key in ("id", "key", "name", "description", "health", "health_note")
    } == {
        "id": pid,
        "key": "DASH",
        "name": "대시보드",
        "description": "프로젝트 개요",
        "health": "at_risk",
        "health_note": "일정 지연",
    }
    assert dashboard["archived_at"] is not None


async def test_dashboard_recent_work_packages_are_capped_ordered_and_assignee_enriched(
    client, app, project
):
    pid = project["id"]
    stamp = datetime(2026, 1, 1, tzinfo=UTC)
    async with app.state.sessionmaker() as session, session.begin():
        assignee = User(email="recent@oneflow.local", display_name="Recent Assignee")
        session.add(assignee)
        await session.flush()
        session.add(ProjectMember(project_id=uuid.UUID(pid), user_id=assignee.id, role="member"))
        session.add_all(
            [
                WorkPackage(
                    id=uuid.UUID(int=index),
                    project_id=uuid.UUID(pid),
                    subject=f"recent-{index}",
                    status="in_progress" if index == 6 else "todo",
                    priority="high" if index == 6 else "none",
                    assignee_id=assignee.id if index == 6 else None,
                    updated_at=stamp + timedelta(seconds=min(index, 5)),
                )
                for index in range(1, 7)
            ]
        )

    items = (await client.get(f"/api/v1/projects/{pid}/dashboard")).json()["recent_work_packages"]
    assert [item["subject"] for item in items] == [
        "recent-6",
        "recent-5",
        "recent-4",
        "recent-3",
        "recent-2",
    ]
    assert (items[0]["status"], items[0]["priority"], items[0]["assignee_name"]) == (
        "in_progress",
        "high",
        "Recent Assignee",
    )
    assert all(item["updated_at"] for item in items)


async def test_dashboard_nonmember_404(client, foreign_project):
    res = await client.get(f"/api/v1/projects/{foreign_project['project_id']}/dashboard")
    assert res.status_code == 404


async def test_project_audit_feed(client, project):
    pid = project["id"]
    wp = await create_wp(client, pid, subject="감사 대상")
    await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "status": "in_progress"},
    )
    feed = (await client.get(f"/api/v1/projects/{pid}/activities")).json()
    assert feed["total"] >= 2  # created + field_changed
    top = feed["items"][0]  # newest first
    assert top["work_package_subject"] == "감사 대상"
    assert top["action"] == "field_changed" and top["field"] == "status"


async def test_project_audit_nonmember_404(client, foreign_project):
    res = await client.get(f"/api/v1/projects/{foreign_project['project_id']}/activities")
    assert res.status_code == 404


async def test_dashboard_csv_export(client, foreign_project):
    """Pass 6 PR-Q: the roll-up as CSV — formula-guarded, BOM'd, member-scoped,
    and readable on archived projects (read/export stays open)."""
    from tests.conftest import create_project, create_wp

    project = await create_project(client, key="DEXP", name="내보내기")
    await create_wp(client, project["id"], subject="하나", status="done")
    await create_wp(client, project["id"], subject="둘")

    res = await client.get(f"/api/v1/projects/{project['id']}/dashboard/export.csv")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    body = res.text
    assert body.startswith("﻿")  # Excel UTF-8 BOM convention
    lines = body.lstrip("﻿").splitlines()
    assert lines[0] == "section,key,value"
    assert "summary,total_work_packages,2" in lines
    assert "status,done,1" in lines

    # Non-member: existence hidden.
    foreign = str(foreign_project["project_id"])
    assert (await client.get(f"/api/v1/projects/{foreign}/dashboard/export.csv")).status_code == 404

    # Archived project keeps its export readable.
    assert (await client.post(f"/api/v1/projects/{project['id']}/archive")).status_code == 200
    assert (
        await client.get(f"/api/v1/projects/{project['id']}/dashboard/export.csv")
    ).status_code == 200
