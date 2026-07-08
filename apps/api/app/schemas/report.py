import uuid

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


class PortfolioReportRead(BaseModel):
    items: list[PortfolioItem]
    totals: PortfolioTotals
    total: int
