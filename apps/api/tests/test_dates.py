"""utc_today helper (Pass 46 PR-BL) — the v21.1 boundary rule in one place."""

from datetime import UTC, datetime

from app.core.dates import utc_today


def test_utc_today_matches_utc_clock():
    assert utc_today() == datetime.now(UTC).date()
