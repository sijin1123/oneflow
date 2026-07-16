import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.cycle import Cycle, CycleScopeEvent
from app.models.work_package import WP_CLOSED_STATUSES, WorkPackage


@dataclass(frozen=True)
class CycleScopeDay:
    date: date
    scope: int
    remaining: int
    delivered: int


@dataclass(frozen=True)
class CycleScopeAnalytics:
    scope: str
    tracking_started_at: datetime
    coverage_start: date | None
    coverage_complete: bool
    total_scope: int
    current_scope: int
    added_count: int
    removed_count: int
    delivered: int
    days: list[CycleScopeDay]


def record_cycle_scope_change(
    session: AsyncSession,
    *,
    project_id: uuid.UUID,
    work_package_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    old_cycle_id: uuid.UUID | None,
    new_cycle_id: uuid.UUID | None,
    occurred_at: datetime | None = None,
) -> None:
    """Stage stable-ID enter/leave events in the caller's transaction."""

    if old_cycle_id == new_cycle_id:
        return
    at = occurred_at or datetime.now(UTC)
    if old_cycle_id is not None:
        session.add(
            CycleScopeEvent(
                project_id=project_id,
                cycle_id=old_cycle_id,
                work_package_id=work_package_id,
                event_type="removed",
                actor_id=actor_id,
                occurred_at=at,
            )
        )
    if new_cycle_id is not None:
        session.add(
            CycleScopeEvent(
                project_id=project_id,
                cycle_id=new_cycle_id,
                work_package_id=work_package_id,
                event_type="added",
                actor_id=actor_id,
                occurred_at=at,
            )
        )


def next_day(value: date) -> date:
    return date.fromordinal(value.toordinal() + 1)


async def _status_context(
    session: AsyncSession, work_package_ids: set[uuid.UUID]
) -> tuple[dict[uuid.UUID, WorkPackage], dict[uuid.UUID, list[tuple[date, str, str]]]]:
    if not work_package_ids:
        return {}, {}
    work_packages = {
        wp.id: wp
        for wp in (
            (await session.execute(select(WorkPackage).where(WorkPackage.id.in_(work_package_ids))))
            .scalars()
            .all()
        )
    }
    activities = (
        await session.execute(
            select(
                Activity.work_package_id,
                Activity.old_value,
                Activity.new_value,
                Activity.created_at,
            )
            .where(
                Activity.work_package_id.in_(work_packages),
                Activity.field == "status",
            )
            .order_by(Activity.created_at.asc(), Activity.id.asc())
        )
    ).all()
    by_work_package: dict[uuid.UUID, list[tuple[date, str, str]]] = {}
    for work_package_id, old_value, new_value, occurred_at in activities:
        if old_value is None or new_value is None:
            continue
        by_work_package.setdefault(work_package_id, []).append(
            (occurred_at.date(), old_value, new_value)
        )
    return work_packages, by_work_package


def _status_on_day(
    work_package: WorkPackage,
    history: list[tuple[date, str, str]] | None,
    day: date,
) -> str:
    if not history:
        return work_package.status
    if history[0][0] > day:
        return history[0][1]
    return next(change[2] for change in reversed(history) if change[0] <= day)


async def _legacy_current_assignment(
    session: AsyncSession,
    cycle: Cycle,
    end: date,
) -> CycleScopeAnalytics:
    work_packages = (
        (
            await session.execute(
                select(WorkPackage).where(
                    WorkPackage.project_id == cycle.project_id,
                    WorkPackage.cycle_id == cycle.id,
                )
            )
        )
        .scalars()
        .all()
    )
    by_id, histories = await _status_context(session, {wp.id for wp in work_packages})
    days: list[CycleScopeDay] = []
    if work_packages and end >= cycle.start_date:
        day = cycle.start_date
        closed = set(WP_CLOSED_STATUSES)
        while day <= end:
            present = [wp for wp in by_id.values() if wp.created_at.date() <= day]
            remaining = sum(
                _status_on_day(wp, histories.get(wp.id), day) not in closed for wp in present
            )
            days.append(
                CycleScopeDay(
                    date=day,
                    scope=len(present),
                    remaining=remaining,
                    delivered=len(present) - remaining,
                )
            )
            day = next_day(day)
    last = days[-1] if days else None
    return CycleScopeAnalytics(
        scope="legacy_current_assignment",
        tracking_started_at=cycle.scope_tracking_started_at,
        coverage_start=None,
        coverage_complete=False,
        total_scope=len(work_packages),
        current_scope=last.scope if last else 0,
        added_count=0,
        removed_count=0,
        delivered=last.delivered if last else 0,
        days=days,
    )


async def build_cycle_scope_analytics(
    session: AsyncSession,
    cycle: Cycle,
    today: date,
) -> CycleScopeAnalytics:
    """Rebuild date-granularity cycle scope without inventing legacy history."""

    end = min(cycle.end_date, today)
    tracking_day = cycle.scope_tracking_started_at.date()
    coverage_complete = cycle.scope_tracking_complete or cycle.start_date > tracking_day
    if not coverage_complete and cycle.end_date < tracking_day:
        return await _legacy_current_assignment(session, cycle, end)

    coverage_start = cycle.start_date if coverage_complete else max(cycle.start_date, tracking_day)
    empty = CycleScopeAnalytics(
        scope="tracked_assignment",
        tracking_started_at=cycle.scope_tracking_started_at,
        coverage_start=coverage_start,
        coverage_complete=coverage_complete,
        total_scope=0,
        current_scope=0,
        added_count=0,
        removed_count=0,
        delivered=0,
        days=[],
    )
    if end < coverage_start:
        return empty

    events = (
        await session.execute(
            select(
                CycleScopeEvent.work_package_id,
                CycleScopeEvent.event_type,
                CycleScopeEvent.occurred_at,
            )
            .where(CycleScopeEvent.cycle_id == cycle.id)
            .order_by(CycleScopeEvent.occurred_at.asc(), CycleScopeEvent.id.asc())
        )
    ).all()
    if not events:
        return empty

    work_packages, histories = await _status_context(
        session, {work_package_id for work_package_id, _, _ in events}
    )
    events = [event for event in events if event[0] in work_packages]
    closed = set(WP_CLOSED_STATUSES)
    active: set[uuid.UUID] = set()
    days: list[CycleScopeDay] = []
    event_index = 0
    added_count = 0
    removed_count = 0
    day = coverage_start
    while day <= end:
        while event_index < len(events) and events[event_index][2].date() <= day:
            work_package_id, event_type, occurred_at = events[event_index]
            if event_type in {"baseline", "added"}:
                active.add(work_package_id)
            else:
                active.discard(work_package_id)
            event_day = occurred_at.date()
            if coverage_start <= event_day <= end:
                if event_type == "added":
                    added_count += 1
                elif event_type == "removed":
                    removed_count += 1
            event_index += 1
        remaining = sum(
            _status_on_day(work_packages[work_package_id], histories.get(work_package_id), day)
            not in closed
            for work_package_id in active
        )
        days.append(
            CycleScopeDay(
                date=day,
                scope=len(active),
                remaining=remaining,
                delivered=len(active) - remaining,
            )
        )
        day = next_day(day)

    last = days[-1]
    return CycleScopeAnalytics(
        scope="tracked_assignment",
        tracking_started_at=cycle.scope_tracking_started_at,
        coverage_start=coverage_start,
        coverage_complete=coverage_complete,
        total_scope=max(point.scope for point in days),
        current_scope=last.scope,
        added_count=added_count,
        removed_count=removed_count,
        delivered=last.delivered,
        days=days,
    )
