"""Recurring-meeting sweep (Pass 69 PR-CI, v69.1).

Recurrence is an automated follow-up CHAIN: only the tail meeting carries the
`recurrence` preset. For every past-dated tail (archived projects excluded)
this sweep creates the next occurrence — same title, agenda carried, open
unconverted action items copied — hands the recurrence to it and clears the
source, repeating until the new tail is today or later (catch-up, capped).

Safety model:
- pg_try_advisory_xact_lock(427010) — concurrent runs are a no-op (due-alerts
  pattern);
- each tail is SELECT ... FOR UPDATE and the recurrence hand-off is a
  CONDITIONAL update (rowcount 0 → a user PATCH won the race → skip, the
  user's stop-recurrence intent never resurrects — R1-③);
- idempotency probes use recurrence_source_id, never title+date (R1-①): a
  crash between insert and hand-off resolves on the next run by clearing the
  source without inserting again;
- the inherited author must still be an ACTIVE project member, else the new
  occurrence is author-less (R1-②).

CLI:  python -m app.services.recurring_meetings [--create]   (default: dry-run)
"""

import asyncio
import calendar
import sys
import uuid
from datetime import date, timedelta

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.dates import utc_today
from app.db.session import build_engine, build_sessionmaker
from app.models.meeting import Meeting, MeetingActionItem
from app.models.member import ProjectMember
from app.models.project import Project
from app.models.user import User

RECURRING_LOCK_CLASSID = 427010
# Catch-up bound per chain per run: far beyond any real gap (24 monthly = 2y,
# 24 weekly ≈ 6 months of downtime) while keeping a runaway loop impossible.
MAX_OCCURRENCES_PER_RUN = 24


def next_occurrence(current: date, recurrence: str) -> date:
    """weekly +7d / biweekly +14d / monthly +1 month with end-of-month clamp.
    The clamped date becomes the NEW anchor (1/31 → 2/28 → 3/28 — stateless
    by decision, v69.1 R1-④)."""
    if recurrence == "weekly":
        return current + timedelta(days=7)
    if recurrence == "biweekly":
        return current + timedelta(days=14)
    year, month = (
        (current.year + 1, 1) if current.month == 12 else (current.year, current.month + 1)
    )
    return date(year, month, min(current.day, calendar.monthrange(year, month)[1]))


async def _author_if_eligible(
    session: AsyncSession, project_id: uuid.UUID, author_id: uuid.UUID | None
) -> uuid.UUID | None:
    if author_id is None:
        return None
    row = (
        await session.execute(
            select(ProjectMember.user_id)
            .join(User, User.id == ProjectMember.user_id)
            .where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == author_id,
                User.is_active.is_(True),
            )
        )
    ).first()
    return author_id if row is not None else None


async def _spawn_next(session: AsyncSession, src: Meeting) -> Meeting | None:
    """One hand-off step under the row lock. Returns the new tail, or None
    when the chain must stop (race lost / already spawned / cap logic above)."""
    # Idempotency: a crash after insert but before hand-off left an anchored
    # occurrence — just clear the source now, don't insert twice (R1-①).
    existing = (
        await session.execute(select(Meeting).where(Meeting.recurrence_source_id == src.id))
    ).scalar_one_or_none()
    if existing is None:
        author = await _author_if_eligible(session, src.project_id, src.author_id)
        nxt = Meeting(
            project_id=src.project_id,
            title=src.title,
            scheduled_on=next_occurrence(src.scheduled_on, src.recurrence),
            agenda=src.agenda,  # sanitized at original write time
            author_id=author,
            recurrence_source_id=src.id,
        )
        session.add(nxt)
        await session.flush()
        open_items = (
            (
                await session.execute(
                    select(MeetingActionItem).where(
                        MeetingActionItem.meeting_id == src.id,
                        MeetingActionItem.done.is_(False),
                        MeetingActionItem.converted_wp_id.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        # Carried items are NEW assignments — current ACTIVE non-viewer
        # members only (the follow-up contract, v34.1/v61.1).
        eligible = {
            row
            for row in (
                await session.execute(
                    select(ProjectMember.user_id)
                    .join(User, User.id == ProjectMember.user_id)
                    .where(
                        ProjectMember.project_id == src.project_id,
                        ProjectMember.role != "viewer",
                        User.is_active.is_(True),
                    )
                )
            ).scalars()
        }
        for item in open_items:
            session.add(
                MeetingActionItem(
                    meeting_id=nxt.id,
                    description=item.description,
                    assignee_id=item.assignee_id if item.assignee_id in eligible else None,
                    done=False,
                )
            )
    else:
        nxt = existing

    # Conditional hand-off: if a user PATCH changed the tail since our
    # snapshot, their intent wins and this chain is skipped (R1-③).
    recurrence = src.recurrence
    handed = await session.execute(
        update(Meeting)
        .where(Meeting.id == src.id, Meeting.recurrence == recurrence)
        .values(recurrence=None, version=Meeting.version + 1)
    )
    if (handed.rowcount or 0) == 0:
        return None
    await session.execute(update(Meeting).where(Meeting.id == nxt.id).values(recurrence=recurrence))
    nxt.recurrence = recurrence
    return nxt


async def run(create: bool) -> dict[str, int] | None:
    """None when another run holds the lock; else counts."""
    settings = get_settings()
    engine = build_engine(settings)
    sessionmaker = build_sessionmaker(engine)
    today = utc_today()
    try:
        async with sessionmaker() as session, session.begin():
            locked = (
                await session.execute(
                    text("SELECT pg_try_advisory_xact_lock(:c, 0)").bindparams(
                        c=RECURRING_LOCK_CLASSID
                    )
                )
            ).scalar_one()
            if not locked:
                return None
            tails = (
                (
                    await session.execute(
                        select(Meeting.id)
                        .join(Project, Meeting.project_id == Project.id)
                        .where(
                            Meeting.recurrence.is_not(None),
                            Meeting.scheduled_on < today,
                            Project.archived_at.is_(None),  # R1-⑦
                        )
                    )
                )
                .scalars()
                .all()
            )
            if not create:
                return {"chains": len(tails), "created": 0}
            created = 0
            for tail_id in tails:
                src = (
                    await session.execute(
                        select(Meeting).where(Meeting.id == tail_id).with_for_update()
                    )
                ).scalar_one_or_none()
                steps = 0
                while (
                    src is not None
                    and src.recurrence is not None
                    and src.scheduled_on is not None
                    and src.scheduled_on < today
                    and steps < MAX_OCCURRENCES_PER_RUN
                ):
                    nxt = await _spawn_next(session, src)
                    if nxt is None:
                        break  # race lost — the user's PATCH wins (R1-③)
                    steps += 1
                    src = nxt
                created += steps
                if steps >= MAX_OCCURRENCES_PER_RUN:
                    print(f"[recurring-meetings] chain {tail_id}: cap reached, continuing next run")
            return {"chains": len(tails), "created": created}
    finally:
        await engine.dispose()


async def _main() -> int:
    create = "--create" in sys.argv
    result = await run(create)
    if result is None:
        print("[recurring-meetings] another run holds the lock — no-op")
        return 0
    mode = "created" if create else "dry-run"
    print(f"[recurring-meetings] {mode}: chains={result['chains']} created={result['created']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
