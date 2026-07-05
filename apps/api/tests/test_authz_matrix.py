"""Authorization-matrix coverage (fable5 audit: several owner-403 and direct-ID
foreign-resource boundaries were unexercised).

These lock in existing behavior so a regression (e.g. swapping require_role for
require_member, or dropping a per-resource scope check) is caught.
"""

from datetime import date

from sqlalchemy import update

from app.models import (
    Attachment,
    Meeting,
    MeetingActionItem,
    ProjectDocument,
    ProjectMember,
    TimeEntry,
    WorkPackage,
)

RULE_BODY = {
    "name": "규칙",
    "trigger_type": "status_changed_to",
    "trigger_value": "in_review",
    "action_type": "set_priority",
    "action_value": "high",
}


async def test_member_cannot_create_automation_rule_403(client, member_project):
    pid = member_project["project_id"]
    res = await client.post(f"/api/v1/projects/{pid}/automation-rules", json=RULE_BODY)
    assert res.status_code == 403


async def test_member_cannot_patch_project_403(client, member_project):
    pid = member_project["project_id"]
    res = await client.patch(f"/api/v1/projects/{pid}", json={"name": "새 이름"})
    assert res.status_code == 403


async def test_foreign_document_direct_access_404(app, client, foreign_project):
    pid = foreign_project["project_id"]
    async with app.state.sessionmaker() as session, session.begin():
        doc = ProjectDocument(project_id=pid, title="남의 문서", body="<p>x</p>")
        session.add(doc)
        await session.flush()
        doc_id = doc.id
    # dev is not a member of this project → every direct-ID verb is 404.
    assert (await client.get(f"/api/v1/documents/{doc_id}")).status_code == 404
    assert (
        await client.patch(
            f"/api/v1/documents/{doc_id}", json={"expected_version": 0, "title": "해킹"}
        )
    ).status_code == 404
    assert (await client.delete(f"/api/v1/documents/{doc_id}")).status_code == 404


async def test_foreign_meeting_and_action_item_direct_access_404(app, client, foreign_project):
    pid = foreign_project["project_id"]
    async with app.state.sessionmaker() as session, session.begin():
        m = Meeting(project_id=pid, title="남의 회의")
        session.add(m)
        await session.flush()
        item = MeetingActionItem(meeting_id=m.id, description="할 일")
        session.add(item)
        await session.flush()
        meeting_id, item_id = m.id, item.id
    assert (await client.get(f"/api/v1/meetings/{meeting_id}")).status_code == 404
    assert (await client.delete(f"/api/v1/meetings/{meeting_id}")).status_code == 404
    assert (
        await client.patch(f"/api/v1/action-items/{item_id}", json={"done": True})
    ).status_code == 404
    assert (await client.delete(f"/api/v1/action-items/{item_id}")).status_code == 404


async def test_foreign_attachment_delete_404(app, client, foreign_project):
    pid = foreign_project["project_id"]
    async with app.state.sessionmaker() as session, session.begin():
        att = Attachment(project_id=pid, filename="a.pdf", url="https://ex.com/a.pdf")
        session.add(att)
        await session.flush()
        att_id = att.id
    assert (await client.delete(f"/api/v1/attachments/{att_id}")).status_code == 404


async def test_time_entry_delete_requires_author_or_owner(app, client, member_project):
    """dev is a plain member; an entry logged by the owner cannot be deleted by dev
    (403), but once dev is promoted to owner the override applies (204)."""
    pid = member_project["project_id"]
    owner_id = member_project["owner_id"]
    dev_id = member_project["dev_id"]
    async with app.state.sessionmaker() as session, session.begin():
        wp = WorkPackage(project_id=pid, subject="작업")
        session.add(wp)
        await session.flush()
        entry = TimeEntry(
            work_package_id=wp.id, user_id=owner_id, hours=2, spent_on=date(2026, 7, 1)
        )
        session.add(entry)
        await session.flush()
        wp_id, entry_id = wp.id, entry.id

    # member, non-author → 403
    res = await client.delete(f"/api/v1/work-packages/{wp_id}/time-entries/{entry_id}")
    assert res.status_code == 403

    # promote dev to owner → owner override deletes any entry
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            update(ProjectMember)
            .where(ProjectMember.project_id == pid, ProjectMember.user_id == dev_id)
            .values(role="owner")
        )
    res = await client.delete(f"/api/v1/work-packages/{wp_id}/time-entries/{entry_id}")
    assert res.status_code == 204
