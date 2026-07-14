"""Project health status (expansion PLAN Pass 37 PR-BC).

Contract (v37.1 + UI-108): closed vocabulary plus append-only transition
history; transition table — omitted health leaves everything untouched and a
standalone note is 422; a set health ALWAYS replaces the note (omitted →
null, Pass 29 precedent) and stamps by/at; null clears all fields (note
alongside = 422); DB shape CHECK blocks impossible states."""

import asyncio

import pytest
from sqlalchemy import delete, text
from sqlalchemy.exc import IntegrityError

from app.models.project_health_history import ProjectHealthHistory
from app.models.user import User
from tests.conftest import create_project


async def patch(client, pid, body):
    return await client.patch(f"/api/v1/projects/{pid}", json=body)


@pytest.fixture
async def project(client):
    return await create_project(client, key="HLTH", name="헬스 프로젝트")


async def test_health_transition_table(client, project):
    pid = project["id"]
    me = (await client.get("/api/v1/me")).json()

    # Fresh project: fully unset.
    assert project["health"] is None
    assert project["health_note"] is None

    # Set with note: stamps actor + time.
    res = await patch(client, pid, {"health": "at_risk", "health_note": "  일정 지연  "})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["health"] == "at_risk"
    assert body["health_note"] == "일정 지연"  # trimmed
    assert body["health_updated_by"] == me["id"]
    assert body["health_updated_at"] is not None

    # Setting health WITHOUT a note replaces the note with null (Pass 29 —
    # a stale reason never lingers on a new status).
    res = await patch(client, pid, {"health": "on_track"})
    assert res.json()["health_note"] is None

    # Omitted health + other fields → health untouched.
    res = await patch(client, pid, {"name": "이름만 변경"})
    assert res.json()["health"] == "on_track"

    # Standalone note (health omitted) is a 422 — the note is not independent.
    assert (await patch(client, pid, {"health_note": "사유만"})).status_code == 422

    # Clearing: null resets everything; a note alongside is contradictory.
    assert (await patch(client, pid, {"health": None, "health_note": "모순"})).status_code == 422
    res = await patch(client, pid, {"health": None})
    assert res.status_code == 200
    body = res.json()
    assert (body["health"], body["health_note"], body["health_updated_by"]) == (None, None, None)
    assert body["health_updated_at"] is None

    # Vocabulary + note length.
    assert (await patch(client, pid, {"health": "fine"})).status_code == 422
    assert (
        await patch(client, pid, {"health": "on_track", "health_note": "x" * 2001})
    ).status_code == 422

    # Whitespace-only note normalizes to null.
    res = await patch(client, pid, {"health": "on_track", "health_note": "   "})
    assert res.json()["health_note"] is None


async def test_health_history_tracks_changes_clear_and_noop(client, project):
    pid = project["id"]
    me = (await client.get("/api/v1/me")).json()

    empty = (await client.get(f"/api/v1/projects/{pid}/health-history")).json()
    assert empty == {"items": [], "total": 0}

    await patch(client, pid, {"health": "at_risk", "health_note": "일정 지연"})
    first = await client.get(f"/api/v1/projects/{pid}/health-history")
    assert first.status_code == 200
    assert first.json()["total"] == 1
    item = first.json()["items"][0]
    assert {
        key: item[key]
        for key in (
            "previous_health",
            "previous_note",
            "health",
            "note",
            "changed_by",
            "changed_by_name",
        )
    } == {
        "previous_health": None,
        "previous_note": None,
        "health": "at_risk",
        "note": "일정 지연",
        "changed_by": me["id"],
        "changed_by_name": "Dev User",
    }

    # Same normalized report is a true no-op and does not move the latest stamp.
    current = (await client.get(f"/api/v1/projects/{pid}")).json()
    await patch(client, pid, {"health": "at_risk", "health_note": " 일정 지연 "})
    unchanged = (await client.get(f"/api/v1/projects/{pid}")).json()
    assert unchanged["health_updated_at"] == current["health_updated_at"]
    assert (await client.get(f"/api/v1/projects/{pid}/health-history")).json()["total"] == 1

    await patch(client, pid, {"health": None})
    history = (await client.get(f"/api/v1/projects/{pid}/health-history")).json()
    assert history["total"] == 2
    assert history["items"][0]["previous_health"] == "at_risk"
    assert history["items"][0]["health"] is None
    assert history["items"][0]["note"] is None

    page = (await client.get(f"/api/v1/projects/{pid}/health-history?limit=1&offset=1")).json()
    assert page["total"] == 2
    assert len(page["items"]) == 1
    assert page["items"][0]["health"] == "at_risk"
    assert (await client.get(f"/api/v1/projects/{pid}/health-history?limit=101")).status_code == 422


async def test_health_history_member_visibility_and_concurrent_chain(
    client, app, project, member_project, foreign_project
):
    shared = str(member_project["project_id"])
    foreign = str(foreign_project["project_id"])
    assert (await client.get(f"/api/v1/projects/{shared}/health-history")).status_code == 200
    assert (await client.get(f"/api/v1/projects/{foreign}/health-history")).status_code == 404

    # A removed author never makes historical reports unreadable or leaks a
    # stale display name. The FK is SET NULL and the reader keeps a safe shape.
    async with app.state.sessionmaker() as session, session.begin():
        session.add(
            ProjectHealthHistory(
                project_id=member_project["project_id"],
                previous_health=None,
                previous_note=None,
                health="on_track",
                note="공유 프로젝트 시작",
                changed_by=member_project["owner_id"],
            )
        )
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(delete(User).where(User.id == member_project["owner_id"]))
    shared_history = (await client.get(f"/api/v1/projects/{shared}/health-history")).json()
    assert shared_history["items"][0]["changed_by"] is None
    assert shared_history["items"][0]["changed_by_name"] is None

    pid = project["id"]
    first, second = await asyncio.gather(
        patch(client, pid, {"health": "at_risk", "health_note": "A"}),
        patch(client, pid, {"health": "off_track", "health_note": "B"}),
    )
    assert first.status_code == second.status_code == 200
    current = (await client.get(f"/api/v1/projects/{pid}")).json()
    history = (await client.get(f"/api/v1/projects/{pid}/health-history")).json()
    assert history["total"] == 2
    newest, older = history["items"]
    assert newest["health"] == current["health"]
    assert (newest["previous_health"], newest["previous_note"]) == (
        older["health"],
        older["note"],
    )


async def test_health_in_list_and_guards(client, app, project, member_project, foreign_project):
    pid = project["id"]
    await patch(client, pid, {"health": "off_track", "health_note": "차단"})

    listed = (await client.get("/api/v1/projects")).json()
    row = next(p for p in listed["items"] if p["id"] == pid)
    assert (row["health"], row["health_note"]) == ("off_track", "차단")

    # Member (non-owner) cannot report health — owner-only PATCH (403).
    shared = str(member_project["project_id"])
    assert (await patch(client, shared, {"health": "on_track"})).status_code == 403
    # Non-member: existence hidden.
    foreign = str(foreign_project["project_id"])
    assert (await patch(client, foreign, {"health": "on_track"})).status_code == 404

    # Archived project: central write gate.
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (await patch(client, pid, {"health": "on_track"})).status_code == 409
    await client.post(f"/api/v1/projects/{pid}/unarchive")

    # DB shape CHECK blocks impossible states (health set without timestamp).
    with pytest.raises(IntegrityError):
        async with app.state.sessionmaker() as session, session.begin():
            await session.execute(
                text(
                    "UPDATE projects SET health = 'on_track', health_updated_at = NULL "
                    "WHERE id = CAST(:pid AS uuid)"
                ).bindparams(pid=pid)
            )
