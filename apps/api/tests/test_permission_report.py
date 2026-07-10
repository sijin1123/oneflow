"""Permission report + registry honesty (Pass 62 PR-CA, v62.1).

Three layers:
- endpoint contract: member/viewer read 200, non-member 404, archived read 200;
- coverage: every mutating /api/v1 route in the OpenAPI schema is mapped to a
  registry verb or explicitly allowlisted — a new write endpoint that skips
  the report fails here (R1-③);
- accuracy: representative verbs are exercised per role and must behave as
  declared, including the author/non-author conditional split (R1-①).
"""

import datetime as dt
import uuid

from sqlalchemy import select, update

from app.core.permissions import (
    ENDPOINT_ALLOWLIST,
    ENDPOINT_VERBS,
    PERMISSION_MATRIX,
    VERB_KEYS,
)
from app.models import Project, ProjectMember, TimeEntry, User, WorkPackage
from tests.conftest import create_project


async def _viewer_setup(app):
    """Dev user as VIEWER in someone else's project (mirrors viewer_project)."""
    async with app.state.sessionmaker() as session, session.begin():
        owner = User(email="owner@oneflow.local", display_name="Owner")
        project = Project(key="PRM", name="권한 리포트")
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
        return {"project_id": project.id, "owner_id": owner.id, "dev_id": dev.id}


# ------------------------------------------------------------------ contract


async def test_report_shape_and_my_role(client, dev_user):
    project = await create_project(client, key="PR1")
    res = await client.get(f"/api/v1/projects/{project['id']}/permissions")
    assert res.status_code == 200
    body = res.json()
    assert body["my_role"] == "owner"
    keys = [v["key"] for v in body["verbs"]]
    assert keys == [row["key"] for row in PERMISSION_MATRIX]
    for v in body["verbs"]:
        for col in ("owner", "member", "viewer"):
            assert v[col] in ("always", "never", "conditional")
        # Three-state honesty: a conditional cell must explain itself.
        if "conditional" in (v["owner"], v["member"], v["viewer"]):
            assert v["condition"], v["key"]


async def test_report_readable_as_viewer_and_hidden_from_nonmember(app, client, foreign_project):
    ctx = await _viewer_setup(app)
    res = await client.get(f"/api/v1/projects/{ctx['project_id']}/permissions")
    assert res.status_code == 200
    assert res.json()["my_role"] == "viewer"
    # Non-member: existence hiding.
    res = await client.get(f"/api/v1/projects/{foreign_project['project_id']}/permissions")
    assert res.status_code == 404


async def test_report_readable_on_archived_project(client):
    project = await create_project(client, key="PR2")
    assert (await client.post(f"/api/v1/projects/{project['id']}/archive")).status_code == 200
    res = await client.get(f"/api/v1/projects/{project['id']}/permissions")
    assert res.status_code == 200


# ------------------------------------------------------------------ coverage


async def test_every_mutating_route_is_registered(app):
    """R1-③: registry coverage is total, and never stale in either direction."""
    schema = app.openapi()
    mutating = {
        f"{method.upper()} {path}"
        for path, ops in schema["paths"].items()
        for method in ops
        if method in ("post", "patch", "put", "delete")
    }
    mapped = set(ENDPOINT_VERBS) | set(ENDPOINT_ALLOWLIST)
    unregistered = sorted(mutating - mapped)
    assert unregistered == [], (
        "mutating routes missing from the permission registry "
        f"(map them in ENDPOINT_VERBS or justify in ENDPOINT_ALLOWLIST): {unregistered}"
    )
    stale = sorted(mapped - mutating)
    assert stale == [], f"registry entries for routes that no longer exist: {stale}"
    overlap = sorted(set(ENDPOINT_VERBS) & set(ENDPOINT_ALLOWLIST))
    assert overlap == [], f"routes both mapped and allowlisted: {overlap}"
    unknown_verbs = sorted({v for v in ENDPOINT_VERBS.values() if v not in VERB_KEYS})
    assert unknown_verbs == [], f"ENDPOINT_VERBS references unknown verbs: {unknown_verbs}"


# ------------------------------------------------------------------ accuracy


async def test_accuracy_owner_only_verbs(app, client, member_project):
    """member.manage / automation.manage declare member=never → live 403."""
    pid = member_project["project_id"]
    res = await client.post(
        f"/api/v1/projects/{pid}/members", json={"email": "x@y.zz", "role": "member"}
    )
    assert res.status_code == 403
    res = await client.post(
        f"/api/v1/projects/{pid}/automation-rules",
        json={
            "name": "규칙",
            "trigger_type": "status_changed_to",
            "trigger_value": "done",
            "action_type": "set_priority",
            "action_value": "high",
        },
    )
    assert res.status_code == 403


async def test_accuracy_member_write_and_viewer_never(app, client, member_project):
    """work.write declares member=always, viewer=never — same verb, both roles."""
    pid = member_project["project_id"]
    res = await client.post(f"/api/v1/projects/{pid}/work-packages", json={"subject": "멤버 쓰기"})
    assert res.status_code == 201
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            update(ProjectMember)
            .where(
                ProjectMember.project_id == pid,
                ProjectMember.user_id == member_project["dev_id"],
            )
            .values(role="viewer")
        )
    res = await client.post(f"/api/v1/projects/{pid}/work-packages", json={"subject": "뷰어 쓰기"})
    assert res.status_code == 403


async def test_accuracy_entry_delete_conditional_split(app, client, member_project):
    """entry.delete: member=conditional(author-only) — non-author 403, author 204."""
    pid = member_project["project_id"]
    async with app.state.sessionmaker() as session, session.begin():
        wp = WorkPackage(project_id=pid, subject="시간 기록 대상")
        session.add(wp)
        await session.flush()
        theirs = TimeEntry(
            work_package_id=wp.id,
            user_id=member_project["owner_id"],
            hours=1,
            spent_on=dt.date(2026, 7, 1),
        )
        session.add(theirs)
        await session.flush()
        wp_id, theirs_id = wp.id, theirs.id

    # Non-author member → 403 (conditional not met).
    res = await client.delete(f"/api/v1/work-packages/{wp_id}/time-entries/{theirs_id}")
    assert res.status_code == 403
    # Author member → allowed.
    mine = (
        await client.post(
            f"/api/v1/work-packages/{wp_id}/time-entries",
            json={"hours": 2, "spent_on": "2026-07-02"},
        )
    ).json()
    res = await client.delete(f"/api/v1/work-packages/{wp_id}/time-entries/{mine['id']}")
    assert res.status_code == 204


async def test_accuracy_saved_filter_edit_author_only_even_for_owner(app, client, dev_user):
    """saved_filter.edit: owner=conditional — an owner cannot edit another
    author's view (404 per the saved-filter contract)."""
    project = await create_project(client, key="PR3")
    pid = project["id"]
    async with app.state.sessionmaker() as session, session.begin():
        other = User(email="author@oneflow.local", display_name="Author")
        session.add(other)
        await session.flush()
        session.add(ProjectMember(project_id=uuid.UUID(pid), user_id=other.id, role="member"))
        other_id = other.id
    # A shared view authored by the other member (direct insert via API is
    # impossible as dev — insert the row).
    from app.models.saved_filter import SavedFilter

    async with app.state.sessionmaker() as session, session.begin():
        sf = SavedFilter(
            project_id=uuid.UUID(pid), user_id=other_id, name="남의 뷰", is_shared=True
        )
        session.add(sf)
        await session.flush()
        sf_id = sf.id
    res = await client.delete(f"/api/v1/projects/{pid}/saved-filters/{sf_id}")
    assert res.status_code == 404  # author-only, existence hidden


async def test_accuracy_dashboard_layout_always_for_viewer(app, client):
    """dashboard.layout: viewer=always — the personal-preference exception."""
    ctx = await _viewer_setup(app)
    res = await client.put(
        f"/api/v1/projects/{ctx['project_id']}/dashboard/layout",
        json={"widgets": ["progress"]},
    )
    assert res.status_code == 200
