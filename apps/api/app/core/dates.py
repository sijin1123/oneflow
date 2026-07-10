"""Date-boundary helper (Pass 46 PR-BL).

The v21.1 contract: every date-only boundary is computed in UTC at the API
layer — never the DB's CURRENT_DATE, never the server's local date. One
helper so the rule is greppable."""

from datetime import UTC, date, datetime


def utc_today() -> date:
    return datetime.now(UTC).date()
