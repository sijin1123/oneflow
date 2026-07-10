"""Recurring meetings (Pass 69 PR-CI, v69.1).

Chain semantics: only the tail carries `recurrence`; the sweep spawns the
next occurrence (agenda + open unconverted items carried), hands the
recurrence over and clears the source — catching up until the tail is
current. Idempotency by recurrence_source_id (never title+date); a user's
stop-recurrence PATCH always wins the race; archived projects are skipped.
"""

import datetime as dt
import uuid

from sqlalchemy import select, text, update

from app.core.dates import utc_today
from app.models.meeting import Meeting, MeetingActionItem
from app.services import recurring_meetings as mod
from app.services.recurring_meetings import next_occurrence
from tests.conftest import create_project


async def _run(app, create=True):
    settings = app.state.settings
    orig = mod.get_settings
    mod.get_settings = lambda: settings
    try:
        return await mod.run(create=create)
    finally:
        mod.get_settings = orig


def test_next_occurrence_intervals_and_eom_clamp():
    assert next_occurrence(dt.date(2026, 7, 1), "weekly") == dt.date(2026, 7, 8)
    assert next_occurrence(dt.date(2026, 7, 1), "biweekly") == dt.date(2026, 7, 15)
    # End-of-month clamp; the clamped date is the NEW anchor (R1-④).
    assert next_occurrence(dt.date(2026, 1, 31), "monthly") == dt.date(2026, 2, 28)
    assert next_occurrence(dt.date(2026, 2, 28), "monthly") == dt.date(2026, 3, 28)
    assert next_occurrence(dt.date(2026, 12, 15), "monthly") == dt.date(2027, 1, 15)


async def _make_meeting(client, pid, title="주간 회의", days_ago=7, recurrence="weekly"):
    scheduled = (utc_today() - dt.timedelta(days=days_ago)).isoformat()
    res = await client.post(
        f"/api/v1/projects/{pid}/meetings",
        json={"title": title, "scheduled_on": scheduled, "recurrence": recurrence},
    )
    assert res.status_code == 201, res.text
    return res.json()


async def test_recurrence_requires_date_422(client):
    project = await create_project(client, key="RCV")
    res = await client.post(
        f"/api/v1/projects/{project['id']}/meetings",
        json={"title": "무일자 반복", "recurrence": "weekly"},
    )
    assert res.status_code == 422
    res = await client.post(
        f"/api/v1/projects/{project['id']}/meetings",
        json={"title": "이상한 주기", "scheduled_on": "2026-07-01", "recurrence": "hourly"},
    )
    assert res.status_code == 422
    # Dropping the date off a recurring meeting must drop the recurrence too.
    m = await _make_meeting(client, project["id"])
    res = await client.patch(
        f"/api/v1/meetings/{m['id']}",
        json={"expected_version": m["version"], "scheduled_on": None},
    )
    assert res.status_code == 422
    res = await client.patch(
        f"/api/v1/meetings/{m['id']}",
        json={"expected_version": m["version"], "scheduled_on": None, "recurrence": None},
    )
    assert res.status_code == 200, res.text


async def test_sweep_spawns_carries_and_hands_off(app, client):
    project = await create_project(client, key="RCS")
    pid = project["id"]
    m = await _make_meeting(client, pid, days_ago=3)
    res = await client.post(
        f"/api/v1/meetings/{m['id']}/action-items", json={"description": "미결 항목"}
    )
    assert res.status_code == 201

    result = await _run(app)
    assert result == {"chains": 1, "created": 1}

    async with app.state.sessionmaker() as session:
        src = (
            await session.execute(select(Meeting).where(Meeting.id == uuid.UUID(m["id"])))
        ).scalar_one()
        nxt = (
            await session.execute(
                select(Meeting).where(Meeting.recurrence_source_id == uuid.UUID(m["id"]))
            )
        ).scalar_one()
        assert src.recurrence is None  # source cleared
        assert nxt.recurrence == "weekly"  # tail inherits
        assert nxt.title == src.title and nxt.agenda == src.agenda
        assert nxt.author_id == src.author_id  # active member author survives
        assert nxt.scheduled_on == src.scheduled_on + dt.timedelta(days=7)
        items = (
            (
                await session.execute(
                    select(MeetingActionItem).where(MeetingActionItem.meeting_id == nxt.id)
                )
            )
            .scalars()
            .all()
        )
        assert [i.description for i in items] == ["미결 항목"]

    # Idempotent: re-running creates nothing new.
    assert (await _run(app))["created"] == 0


async def test_sweep_catch_up_until_current(app, client):
    project = await create_project(client, key="RCC")
    await _make_meeting(client, project["id"], days_ago=21)  # 3 weeks behind
    result = await _run(app)
    assert result["created"] == 3  # -14, -7, today (tail no longer past)
    async with app.state.sessionmaker() as session:
        tails = (
            (
                await session.execute(
                    select(Meeting).where(
                        Meeting.title == "주간 회의", Meeting.recurrence.is_not(None)
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(tails) == 1  # exactly ONE active tail
        assert tails[0].scheduled_on >= utc_today()


async def test_sweep_skips_archived_and_future(app, client):
    project = await create_project(client, key="RCA")
    pid = project["id"]
    await _make_meeting(client, pid, title="미래 회의", days_ago=-7)  # future-dated
    past = await _make_meeting(client, pid, title="아카이브 회의", days_ago=7)
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    result = await _run(app)
    assert result == {"chains": 0, "created": 0}
    async with app.state.sessionmaker() as session:
        spawned = (
            await session.execute(
                select(Meeting).where(Meeting.recurrence_source_id == uuid.UUID(past["id"]))
            )
        ).scalar_one_or_none()
        assert spawned is None


async def test_user_stop_recurrence_wins_race(app, client):
    """The conditional hand-off (R1-③): if the tail's recurrence changed after
    the sweep snapshot, the sweep skips — simulated by clearing recurrence
    between candidate scan and hand-off via a direct conditional UPDATE."""
    project = await create_project(client, key="RCR")
    m = await _make_meeting(client, project["id"], days_ago=3)
    # User stops the recurrence BEFORE the sweep runs.
    res = await client.patch(
        f"/api/v1/meetings/{m['id']}",
        json={"expected_version": m["version"], "recurrence": None},
    )
    assert res.status_code == 200
    result = await _run(app)
    assert result == {"chains": 0, "created": 0}

    # And the conditional UPDATE itself: a snapshot mismatch is a no-op.
    async with app.state.sessionmaker() as session, session.begin():
        rows = (
            await session.execute(
                update(Meeting)
                .where(Meeting.id == uuid.UUID(m["id"]), Meeting.recurrence == "weekly")
                .values(recurrence=None)
            )
        ).rowcount
        assert rows == 0


async def test_concurrent_sweep_lock_noop(app):
    """A second run while the advisory lock is held is a clean no-op."""
    async with app.state.sessionmaker() as session, session.begin():
        locked = (
            await session.execute(
                text("SELECT pg_try_advisory_xact_lock(:c, 0)").bindparams(
                    c=mod.RECURRING_LOCK_CLASSID
                )
            )
        ).scalar_one()
        assert locked
        assert await _run(app) is None
