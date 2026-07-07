"""Due-date alert generator (expansion PLAN Pass 40 PR-BF).

Run daily by an operator cron (dry-run by default; `--create` inserts):

    uv run python -m app.services.due_alerts            # report only
    uv run python -m app.services.due_alerts --create   # insert alerts

Contract (v40.1):
- UTC date boundaries (`datetime.now(UTC).date()` — the v21.1 rule).
- due_soon: due_date = tomorrow. overdue: due_date = YESTERDAY only — an item
  alerts once, the day after it slips; there is NO backfill, so the first
  production run cannot flood inboxes (R1-①). Days without a run are not
  made up — the runbook says run daily; reruns are idempotent.
- Recipient: the assignee, only while a CURRENT project member AND active
  (Pass 33/34 semantics), with due_alerts on (absent settings row = true).
- One INSERT..SELECT per kind: candidates and inserts share a statement
  snapshot, so a mid-run status/due change can't produce a stale alert
  (R1-②); NOT EXISTS dedupes against same-day (UTC) alerts, and
  pg_try_advisory_lock(427007) makes concurrent runs a no-op.
- Exit code: 0 on success (created counts on stdout), 2 when another run
  holds the lock.
"""

import argparse
import asyncio
import sys

from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import build_engine, build_sessionmaker

DUE_ALERTS_LOCK_CLASSID = 427007

# One statement per kind: SELECT and INSERT see the same snapshot.
_INSERT = """
INSERT INTO notifications (id, user_id, project_id, work_package_id, actor_id, kind, read)
SELECT gen_random_uuid(), w.assignee_id, w.project_id, w.id, NULL, :kind, false
FROM work_packages w
JOIN projects p ON p.id = w.project_id AND p.archived_at IS NULL
JOIN project_members m ON m.project_id = w.project_id AND m.user_id = w.assignee_id
JOIN users u ON u.id = w.assignee_id AND u.is_active
LEFT JOIN user_notification_settings s ON s.user_id = w.assignee_id
WHERE w.assignee_id IS NOT NULL
  AND w.due_date = CAST(:due_on AS date)
  AND w.status NOT IN ('done', 'cancelled')
  AND COALESCE(s.due_alerts, true)
  AND NOT EXISTS (
    SELECT 1 FROM notifications n
    WHERE n.user_id = w.assignee_id
      AND n.work_package_id = w.id
      AND n.kind = :kind
      AND n.created_at >= CAST(:today AS date)
  )
"""

_COUNT = _INSERT.replace(
    "INSERT INTO notifications (id, user_id, project_id, work_package_id, actor_id, kind, read)\n"
    "SELECT gen_random_uuid(), w.assignee_id, w.project_id, w.id, NULL, :kind, false",
    "SELECT count(*)",
)


async def run(create: bool) -> dict[str, int] | None:
    """None when another run holds the lock; else per-kind counts."""
    from datetime import UTC, datetime, timedelta

    today = datetime.now(UTC).date()
    targets = {
        "due_soon": today + timedelta(days=1),
        "overdue": today - timedelta(days=1),  # first day overdue only (R1-①)
    }

    settings = get_settings()
    engine = build_engine(settings)
    sessionmaker = build_sessionmaker(engine)
    try:
        async with sessionmaker() as session, session.begin():
            locked = (
                await session.execute(
                    text("SELECT pg_try_advisory_xact_lock(:c, 0)").bindparams(
                        c=DUE_ALERTS_LOCK_CLASSID
                    )
                )
            ).scalar_one()
            if not locked:
                return None
            counts: dict[str, int] = {}
            for kind, due_on in targets.items():
                params = {"kind": kind, "due_on": str(due_on), "today": str(today)}
                if create:
                    result = await session.execute(text(_INSERT).bindparams(**params))
                    counts[kind] = result.rowcount or 0
                else:
                    counts[kind] = (
                        await session.execute(text(_COUNT).bindparams(**params))
                    ).scalar_one()
            return counts
    finally:
        await engine.dispose()


async def _main() -> int:
    parser = argparse.ArgumentParser(description="Generate due-date inbox alerts.")
    parser.add_argument("--create", action="store_true", help="insert alerts (default: dry-run)")
    args = parser.parse_args()
    counts = await run(create=args.create)
    if counts is None:
        print("another due-alerts run holds the lock; exiting")
        return 2
    mode = "created" if args.create else "would create (dry-run)"
    for kind, count in counts.items():
        print(f"{mode}: {kind}={count}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_main()))
