"""Viewer role — read-only project membership (expansion PLAN Pass 61).

Contract (v61.1): viewer read = member read (identical scope — internal trust
model); every project-data write is 403 "read-only role"; viewers can never be
an assignment target (manual 422, automation save-time 422, fire-time silent
skip); existing references survive demotion; the dashboard layout (archive-
exempt personal preference) stays writable; the last-owner invariant covers
owner→viewer demotion through the same guard.
"""

import asyncio
import os
import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import (
    Meeting,
    MeetingActionItem,
    ProjectDocument,
    ProjectDocumentComment,
    ProjectDocumentCommentReaction,
    ProjectMember,
    User,
    WorkPackage,
)
from tests.conftest import create_project, create_wp


@pytest.fixture
async def viewer_project(app, _clean_tables):
    """A project owned by someone else where the DEV USER is a VIEWER, with one
    of each readable resource pre-created by the owner."""
    async with app.state.sessionmaker() as session, session.begin():
        owner = User(email="owner@oneflow.local", display_name="Owner")
        from app.models import Project

        project = Project(key="VIW", name="뷰어 프로젝트")
        session.add_all([owner, project])
        await session.flush()
        dev = (
            await session.execute(select(User).where(User.email == "dev@oneflow.local"))
        ).scalar_one()
        session.add_all(
            [
                ProjectMember(project_id=project.id, user_id=owner.id, role="owner"),
                ProjectMember(project_id=project.id, user_id=dev.id, role="viewer"),
            ]
        )
        wp = WorkPackage(project_id=project.id, subject="읽기 대상 작업")
        doc = ProjectDocument(project_id=project.id, title="읽기 문서", body="<p>본문</p>")
        meeting = Meeting(project_id=project.id, title="읽기 회의")
        session.add_all([wp, doc, meeting])
        await session.flush()
        document_comment = ProjectDocumentComment(
            document_id=doc.id,
            project_id=project.id,
            author_id=owner.id,
            body="읽기 전용 코멘트",
        )
        session.add(document_comment)
        await session.flush()
        session.add(
            ProjectDocumentCommentReaction(
                comment_id=document_comment.id,
                user_id=owner.id,
                emoji="👍",
            )
        )
        return {
            "project_id": project.id,
            "owner_id": owner.id,
            "dev_id": dev.id,
            "wp_id": wp.id,
            "doc_id": doc.id,
            "document_comment_id": document_comment.id,
            "meeting_id": meeting.id,
        }


@pytest.fixture
async def viewer_member(app, client, _clean_tables):
    """A project the DEV USER OWNS with a second user added as VIEWER — the
    target for assignment-rejection and role round-trip checks."""
    async with app.state.sessionmaker() as session, session.begin():
        u = User(email="viewer@oneflow.local", display_name="Viewer Choi")
        session.add(u)
        await session.flush()
        viewer_id, viewer_email = u.id, u.email
    project = await create_project(client, key="VAS", name="배정 거부 프로젝트")
    res = await client.post(
        f"/api/v1/projects/{project['id']}/members",
        json={"email": viewer_email, "role": "viewer"},
    )
    assert res.status_code == 201, res.text
    return {"pid": project["id"], "viewer_id": str(viewer_id), "email": viewer_email}


# ---------------------------------------------------------------- reads: 200


async def test_viewer_reads_match_member_reads(client, viewer_project):
    pid = viewer_project["project_id"]
    wp_id = viewer_project["wp_id"]
    reads = [
        f"/api/v1/projects/{pid}",
        f"/api/v1/projects/{pid}/work-packages",
        f"/api/v1/work-packages/{wp_id}",
        f"/api/v1/work-packages/{wp_id}/comments",
        f"/api/v1/work-packages/{wp_id}/time-entries",
        f"/api/v1/work-packages/{wp_id}/watchers",
        f"/api/v1/projects/{pid}/documents",
        f"/api/v1/documents/{viewer_project['doc_id']}",
        f"/api/v1/documents/{viewer_project['doc_id']}/comments",
        f"/api/v1/projects/{pid}/meetings",
        f"/api/v1/meetings/{viewer_project['meeting_id']}",
        f"/api/v1/projects/{pid}/members",
        f"/api/v1/projects/{pid}/dashboard",
        f"/api/v1/projects/{pid}/activities",
        f"/api/v1/projects/{pid}/attachments",
        f"/api/v1/projects/{pid}/storage",
        f"/api/v1/projects/{pid}/saved-filters",
        f"/api/v1/projects/{pid}/intake",
        f"/api/v1/projects/{pid}/milestones",
        f"/api/v1/projects/{pid}/cycles",
        f"/api/v1/projects/{pid}/modules",
    ]
    for url in reads:
        res = await client.get(url)
        assert res.status_code == 200, f"{url}: {res.status_code} {res.text}"
        if url == f"/api/v1/documents/{viewer_project['doc_id']}/comments":
            assert res.json()["items"][0]["reactions"] == [{"key": "👍", "count": 1, "me": False}]


# --------------------------------------------------------------- writes: 403


async def test_viewer_write_matrix_403(client, viewer_project):
    pid = viewer_project["project_id"]
    wp_id = viewer_project["wp_id"]
    attempts = [
        ("post", f"/api/v1/projects/{pid}/work-packages", {"subject": "쓰기 시도"}),
        (
            "patch",
            f"/api/v1/work-packages/{wp_id}",
            {"expected_version": 0, "subject": "수정 시도"},
        ),
        ("post", f"/api/v1/work-packages/{wp_id}/comments", {"body": "댓글 시도"}),
        (
            "post",
            f"/api/v1/work-packages/{wp_id}/time-entries",
            {"hours": 1, "spent_on": "2026-07-01"},
        ),
        ("put", f"/api/v1/work-packages/{wp_id}/watchers/me", None),
        ("delete", f"/api/v1/work-packages/{wp_id}/watchers/me", None),
        ("post", f"/api/v1/projects/{pid}/documents", {"title": "문서 시도"}),
        (
            "patch",
            f"/api/v1/documents/{viewer_project['doc_id']}",
            {"expected_version": 0, "title": "수정"},
        ),
        ("delete", f"/api/v1/documents/{viewer_project['doc_id']}", None),
        (
            "post",
            f"/api/v1/projects/{pid}/attachments/search-index/rebuild",
            None,
        ),
        (
            "put",
            f"/api/v1/document-comments/{viewer_project['document_comment_id']}/reactions/👍",
            None,
        ),
        (
            "delete",
            f"/api/v1/document-comments/{viewer_project['document_comment_id']}/reactions/👍",
            None,
        ),
        ("post", f"/api/v1/projects/{pid}/meetings", {"title": "회의 시도"}),
        ("delete", f"/api/v1/meetings/{viewer_project['meeting_id']}", None),
        ("post", f"/api/v1/projects/{pid}/saved-filters", {"name": "뷰 시도"}),
        ("post", f"/api/v1/projects/{pid}/intake", {"title": "접수 시도"}),
    ]
    for method, url, body in attempts:
        kwargs = {} if body is None else {"json": body}
        res = await getattr(client, method)(url, **kwargs)
        assert res.status_code == 403, f"{method.upper()} {url}: {res.status_code} {res.text}"
        assert res.json()["detail"] == "read-only role", f"{method.upper()} {url}"


async def test_viewer_owner_gates_stay_403(client, viewer_project):
    """require_role owner gates report 403 for viewers too (member-but-
    insufficient-role) — no accidental 404/200 drift from the new role."""
    pid = viewer_project["project_id"]
    res = await client.patch(f"/api/v1/projects/{pid}", json={"name": "설정 시도"})
    assert res.status_code == 403
    res = await client.post(
        f"/api/v1/projects/{pid}/members", json={"email": "x@y.zz", "role": "member"}
    )
    assert res.status_code == 403


async def test_viewer_upload_403_and_no_temp_blob(app, client, viewer_project):
    """The permission check precedes body read/temp creation (v61.1 R1-④):
    a rejected viewer upload leaves the project's blob root untouched."""
    pid = viewer_project["project_id"]
    res = await client.post(
        f"/api/v1/projects/{pid}/attachments/upload?filename=deny.bin",
        content=b"x" * 128,
        headers={"content-type": "application/octet-stream"},
    )
    assert res.status_code == 403
    storage_dir = app.state.settings.storage_dir
    leftovers = [os.path.join(root, f) for root, _, files in os.walk(storage_dir) for f in files]
    assert leftovers == []


async def test_viewer_dashboard_layout_put_allowed(client, viewer_project):
    """Archive-exempt personal preference (v18.1/v61.1 ⑤): project data is
    unchanged, user-scoped, no fan-out — the ONE write a viewer keeps."""
    pid = viewer_project["project_id"]
    res = await client.put(
        f"/api/v1/projects/{pid}/dashboard/layout", json={"widgets": ["progress"]}
    )
    assert res.status_code == 200, res.text
    assert res.json()["widgets"] == ["progress"]


# ------------------------------------------------------- assignment refusal


async def test_manual_assignee_viewer_rejected_422(client, viewer_member):
    pid, viewer_id = viewer_member["pid"], viewer_member["viewer_id"]
    res = await client.post(
        f"/api/v1/projects/{pid}/work-packages",
        json={"subject": "뷰어 배정 시도", "assignee_id": viewer_id},
    )
    assert res.status_code == 422
    wp = await create_wp(client, pid, subject="배정 패치 대상")
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "assignee_id": viewer_id},
    )
    assert res.status_code == 422


async def test_meeting_action_item_assignee_viewer_rejected_422(client, viewer_member):
    pid, viewer_id = viewer_member["pid"], viewer_member["viewer_id"]
    meeting = (
        await client.post(f"/api/v1/projects/{pid}/meetings", json={"title": "배정 회의"})
    ).json()
    res = await client.post(
        f"/api/v1/meetings/{meeting['id']}/action-items",
        json={"description": "뷰어에게", "assignee_id": viewer_id},
    )
    assert res.status_code == 422


async def test_automation_save_time_viewer_rejected_422(client, viewer_member):
    pid, viewer_id = viewer_member["pid"], viewer_member["viewer_id"]
    res = await client.post(
        f"/api/v1/projects/{pid}/automation-rules",
        json={
            "name": "뷰어 자동 배정",
            "trigger_type": "status_changed_to",
            "trigger_value": "done",
            "action_type": "set_assignee",
            "action_value": viewer_id,
        },
    )
    assert res.status_code == 422


async def test_automation_fire_time_skips_demoted_viewer(app, client, viewer_member):
    """A rule saved while the target was a member goes silent once the target
    is demoted to viewer — field skipped, no run, status change still applied."""
    pid, viewer_id = viewer_member["pid"], viewer_member["viewer_id"]
    # Promote to member so the rule saves, then demote back to viewer.
    res = await client.patch(f"/api/v1/projects/{pid}/members/{viewer_id}", json={"role": "member"})
    assert res.status_code == 200
    res = await client.post(
        f"/api/v1/projects/{pid}/automation-rules",
        json={
            "name": "강등 전 저장된 규칙",
            "trigger_type": "status_changed_to",
            "trigger_value": "done",
            "action_type": "set_assignee",
            "action_value": viewer_id,
        },
    )
    assert res.status_code == 201, res.text
    res = await client.patch(f"/api/v1/projects/{pid}/members/{viewer_id}", json={"role": "viewer"})
    assert res.status_code == 200

    wp = await create_wp(client, pid, subject="강등 후 트리거")
    res = await client.patch(
        f"/api/v1/work-packages/{wp['id']}", json={"expected_version": 0, "status": "done"}
    )
    assert res.status_code == 200
    assert res.json()["status"] == "done"
    assert res.json()["assignee_id"] is None
    runs = (await client.get(f"/api/v1/projects/{pid}/automation-rules/runs")).json()
    assert runs["total"] == 0


async def test_action_item_convert_drops_viewer_assignee(app, client, viewer_member):
    """Conversion inherits the assignee only for writable roles — a demoted
    viewer's item converts to an UNASSIGNED work package (never refused)."""
    pid, viewer_id = viewer_member["pid"], viewer_member["viewer_id"]
    res = await client.patch(f"/api/v1/projects/{pid}/members/{viewer_id}", json={"role": "member"})
    assert res.status_code == 200
    meeting = (
        await client.post(f"/api/v1/projects/{pid}/meetings", json={"title": "전환 회의"})
    ).json()
    item = (
        await client.post(
            f"/api/v1/meetings/{meeting['id']}/action-items",
            json={"description": "멤버였을 때 배정", "assignee_id": viewer_id},
        )
    ).json()
    res = await client.patch(f"/api/v1/projects/{pid}/members/{viewer_id}", json={"role": "viewer"})
    assert res.status_code == 200

    res = await client.post(f"/api/v1/action-items/{item['id']}/convert")
    assert res.status_code == 200, res.text
    wp_id = res.json()["converted_wp_id"]
    wp = (await client.get(f"/api/v1/work-packages/{wp_id}")).json()
    assert wp["assignee_id"] is None
    # The item itself keeps its historical assignee (references survive demotion).
    async with app.state.sessionmaker() as session:
        stored = (
            await session.execute(
                select(MeetingActionItem.assignee_id).where(
                    MeetingActionItem.id == uuid.UUID(item["id"])
                )
            )
        ).scalar_one()
        assert stored == uuid.UUID(viewer_id)


async def test_demotion_preserves_existing_assignee(app, client, viewer_member):
    """v61.1 R1-⑥: demotion never rewrites project data — an existing
    assignment survives; only NEW assignments are refused."""
    pid, viewer_id = viewer_member["pid"], viewer_member["viewer_id"]
    res = await client.patch(f"/api/v1/projects/{pid}/members/{viewer_id}", json={"role": "member"})
    assert res.status_code == 200
    wp = await create_wp(client, pid, subject="기존 배정", assignee_id=viewer_id)
    assert wp["assignee_id"] == viewer_id
    res = await client.patch(f"/api/v1/projects/{pid}/members/{viewer_id}", json={"role": "viewer"})
    assert res.status_code == 200
    wp_after = (await client.get(f"/api/v1/work-packages/{wp['id']}")).json()
    assert wp_after["assignee_id"] == viewer_id


# ----------------------------------------------------- role plumbing / enum


async def test_role_round_trip_and_invalid_role_422(client, viewer_member):
    pid, viewer_id = viewer_member["pid"], viewer_member["viewer_id"]
    for role in ("member", "viewer", "owner", "viewer"):
        res = await client.patch(f"/api/v1/projects/{pid}/members/{viewer_id}", json={"role": role})
        assert res.status_code == 200, f"{role}: {res.text}"
        assert res.json()["role"] == role
    res = await client.patch(f"/api/v1/projects/{pid}/members/{viewer_id}", json={"role": "guest"})
    assert res.status_code == 422


async def test_db_check_rejects_unknown_role(app, client, dev_user):
    """The API validator (422) and the DB CHECK are separate layers — the
    rewritten ck_project_members_role_allowed enforces the tri-state enum."""
    project = await create_project(client, key="CHK")
    async with app.state.sessionmaker() as session, session.begin():
        u = User(email="rogue@oneflow.local", display_name="Rogue")
        session.add(u)
        await session.flush()
        session.add(ProjectMember(project_id=uuid.UUID(project["id"]), user_id=u.id, role="guest"))
        with pytest.raises(IntegrityError):
            await session.flush()


async def test_cannot_demote_last_owner_to_viewer(client, dev_user):
    project = await create_project(client, key="LOV")
    res = await client.patch(
        f"/api/v1/projects/{project['id']}/members/{dev_user.id}",
        json={"role": "viewer"},
    )
    assert res.status_code == 422


async def test_concurrent_owner_to_viewer_demotions_keep_one_owner(
    app, client, dev_user, viewer_member
):
    """Same advisory-lock guard as owner→member: two owners demoted to viewer
    concurrently — the project never drops below one owner."""
    pid, viewer_id = viewer_member["pid"], viewer_member["viewer_id"]
    res = await client.patch(f"/api/v1/projects/{pid}/members/{viewer_id}", json={"role": "owner"})
    assert res.status_code == 200
    r1, r2 = await asyncio.gather(
        client.patch(f"/api/v1/projects/{pid}/members/{dev_user.id}", json={"role": "viewer"}),
        client.patch(f"/api/v1/projects/{pid}/members/{viewer_id}", json={"role": "viewer"}),
    )
    statuses = sorted([r1.status_code, r2.status_code])
    assert statuses[0] == 200 and statuses[1] in (403, 422)
    async with app.state.sessionmaker() as session:
        owners = (
            await session.execute(
                select(func.count())
                .select_from(ProjectMember)
                .where(
                    ProjectMember.project_id == uuid.UUID(pid),
                    ProjectMember.role == "owner",
                )
            )
        ).scalar_one()
    assert owners == 1


async def test_meeting_follow_up_drops_viewer_assignee(app, client, viewer_member):
    """Follow-up carry is a NEW assignment: open items assigned to a (now)
    viewer carry over unassigned."""
    pid, viewer_id = viewer_member["pid"], viewer_member["viewer_id"]
    res = await client.patch(f"/api/v1/projects/{pid}/members/{viewer_id}", json={"role": "member"})
    assert res.status_code == 200
    meeting = (
        await client.post(f"/api/v1/projects/{pid}/meetings", json={"title": "원 회의"})
    ).json()
    item = (
        await client.post(
            f"/api/v1/meetings/{meeting['id']}/action-items",
            json={"description": "이월 항목", "assignee_id": viewer_id},
        )
    ).json()
    assert item["assignee_id"] == viewer_id
    res = await client.patch(f"/api/v1/projects/{pid}/members/{viewer_id}", json={"role": "viewer"})
    assert res.status_code == 200

    res = await client.post(f"/api/v1/meetings/{meeting['id']}/follow-up", json={})
    assert res.status_code == 201, res.text
    carried = res.json()["action_items"]
    assert len(carried) == 1
    assert carried[0]["assignee_id"] is None
