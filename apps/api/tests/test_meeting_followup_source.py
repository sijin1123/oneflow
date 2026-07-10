"""Manual follow-up source tracking (Pass 79 PR-CR, v79.1).

follow_up_source_id records the IMMEDIATE parent of a follow-up (R1-①);
follow_up_source_title is filled only on the detail read (R1-②); deleting the
source SET NULLs the link; the recurrence axis (Pass 69) is untouched.
"""

from sqlalchemy import select

from app.models.meeting import Meeting
from tests.conftest import create_project


async def _meeting(client, pid, title="주간 회의", scheduled_on="2026-07-01"):
    res = await client.post(
        f"/api/v1/projects/{pid}/meetings",
        json={"title": title, "scheduled_on": scheduled_on},
    )
    assert res.status_code == 201, res.text
    return res.json()


async def _follow_up(client, meeting_id):
    res = await client.post(f"/api/v1/meetings/{meeting_id}/follow-up", json={})
    assert res.status_code == 201, res.text
    return res.json()


async def test_follow_up_records_immediate_parent_and_title(client):
    project = await create_project(client, key="FUS")
    pid = project["id"]
    src = await _meeting(client, pid)
    fu = await _follow_up(client, src["id"])
    assert fu["follow_up_source_id"] == src["id"]

    detail = (await client.get(f"/api/v1/meetings/{fu['id']}")).json()
    assert detail["follow_up_source_id"] == src["id"]
    assert detail["follow_up_source_title"] == "주간 회의"
    # The source itself has no parent.
    src_detail = (await client.get(f"/api/v1/meetings/{src['id']}")).json()
    assert src_detail["follow_up_source_id"] is None
    assert src_detail["follow_up_source_title"] is None


async def test_follow_up_chain_points_at_immediate_parent(client):
    project = await create_project(client, key="FUC")
    pid = project["id"]
    a = await _meeting(client, pid, scheduled_on="2026-07-01")
    b = await _follow_up(client, a["id"])
    c = await _follow_up(client, b["id"])
    # C's source is B (immediate parent), not the root A (R1-①).
    assert c["follow_up_source_id"] == b["id"]
    assert b["follow_up_source_id"] == a["id"]
    c_detail = (await client.get(f"/api/v1/meetings/{c['id']}")).json()
    assert c_detail["follow_up_source_title"] == b["title"]


async def test_deleting_source_set_nulls_the_link(app, client):
    project = await create_project(client, key="FUD")
    pid = project["id"]
    src = await _meeting(client, pid)
    fu = await _follow_up(client, src["id"])
    assert (await client.delete(f"/api/v1/meetings/{src['id']}")).status_code == 204
    detail = (await client.get(f"/api/v1/meetings/{fu['id']}")).json()
    assert detail["follow_up_source_id"] is None  # SET NULL
    assert detail["follow_up_source_title"] is None


async def test_recurrence_sweep_meeting_has_no_follow_up_source(app, client):
    """The recurrence axis (Pass 69) is distinct — a swept occurrence carries
    recurrence_source_id but NOT follow_up_source_id (v79.1 separate columns)."""
    import datetime as dt

    from app.services import recurring_meetings as mod

    project = await create_project(client, key="FUR")
    pid = project["id"]
    past = (dt.date.today() - dt.timedelta(days=3)).isoformat()
    res = await client.post(
        f"/api/v1/projects/{pid}/meetings",
        json={"title": "반복 회의", "scheduled_on": past, "recurrence": "weekly"},
    )
    assert res.status_code == 201, res.text

    settings = app.state.settings
    orig = mod.get_settings
    mod.get_settings = lambda: settings
    try:
        result = await mod.run(create=True)
    finally:
        mod.get_settings = orig
    assert result["created"] == 1

    async with app.state.sessionmaker() as session:
        spawned = (
            await session.execute(select(Meeting).where(Meeting.recurrence_source_id.is_not(None)))
        ).scalar_one()
        assert spawned.follow_up_source_id is None  # separate axis


async def test_list_response_excludes_source_title(app, client):
    """source_title is a detail-only field — the list path must not serialize
    it (R1-②: no N+1 over the list)."""
    project = await create_project(client, key="FUL")
    pid = project["id"]
    src = await _meeting(client, pid)
    await _follow_up(client, src["id"])
    listed = (await client.get(f"/api/v1/projects/{pid}/meetings")).json()
    assert "follow_up_source_title" not in listed["items"][0]
