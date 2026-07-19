import uuid
from datetime import date, datetime

from pydantic import BaseModel


class PortfolioItem(BaseModel):
    """One project row of the portfolio report (Pass 63, v63.1).

    Numbers reuse the existing contracts: counts share the list-rollup
    predicates (WP_CLOSED_STATUSES, UTC-today overdue), cost_total the
    dashboard's cost_entries sum, hours_total the time_entries sum — all as
    plain floats (workspace single-currency assumption, same as budget)."""

    project_id: uuid.UUID
    key: str
    name: str
    archived: bool
    health: str | None
    member_count: int
    work_package_count: int
    open_work_package_count: int
    overdue_count: int
    budget: float | None
    cost_total: float
    hours_total: float
    schedule_baseline_id: uuid.UUID | None
    schedule_baseline_name: str | None
    schedule_baseline_captured_at: datetime | None
    schedule_baseline_snapshot_count: int
    schedule_changed_count: int
    schedule_risk_count: int


class PortfolioTotals(BaseModel):
    """Server-side sums over the RETURNED items (same statement snapshot —
    the totals can never disagree with the rows they accompany). budget sums
    only projects that have one set."""

    projects: int
    work_packages: int
    open: int
    overdue: int
    budget: float
    cost_total: float
    hours_total: float
    schedule_baseline_projects: int
    schedule_changed_projects: int
    schedule_at_risk_projects: int
    schedule_risk_items: int


class PortfolioReportRead(BaseModel):
    items: list[PortfolioItem]
    totals: PortfolioTotals
    total: int


class PortfolioScheduleTrendPoint(BaseModel):
    baseline_id: uuid.UUID
    name: str
    captured_at: datetime
    snapshot_count: int
    comparison_count: int
    changed_count: int
    risk_count: int


class PortfolioScheduleTrendProject(BaseModel):
    project_id: uuid.UUID
    points: list[PortfolioScheduleTrendPoint]


class PortfolioScheduleTrendRead(BaseModel):
    items: list[PortfolioScheduleTrendProject]
    total: int
    history_limit: int


class PortfolioTimelineMilestone(BaseModel):
    id: uuid.UUID
    name: str
    due_date: date


class PortfolioTimelineItem(BaseModel):
    """One project lane (Pass 75). start/end derive from the project's dated
    work packages (min of starts/dues → max) — null when nothing is dated."""

    project_id: uuid.UUID
    key: str
    name: str
    archived: bool
    start_date: date | None
    end_date: date | None
    open_work_package_count: int
    milestones: list[PortfolioTimelineMilestone]


class PortfolioTimelineRead(BaseModel):
    items: list[PortfolioTimelineItem]
    total: int
