import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

MAX_INT4 = 2_147_483_647


class Bucket(BaseModel):
    key: str
    count: int


class RecentWorkPackageRead(BaseModel):
    """Compact work-package row for the project overview's recent-work panel."""

    id: uuid.UUID
    subject: str
    status: str
    priority: str
    assignee_name: str | None
    updated_at: datetime


class DashboardRead(BaseModel):
    # Project overview metadata. Kept alongside the existing dashboard rollups
    # so current dashboard/export consumers retain their fields unchanged.
    id: uuid.UUID
    key: str
    name: str
    description: str | None
    health: str | None
    health_note: str | None
    archived_at: datetime | None
    total_work_packages: int
    open_work_packages: int  # not done/cancelled
    completion_percent: float
    overdue_count: int  # due_date < today and still open
    status_counts: list[Bucket]
    priority_counts: list[Bucket]
    type_counts: list[Bucket]
    total_estimated_hours: float
    total_spent_hours: float
    budget: float | None
    total_cost: float
    recent_work_packages: list[RecentWorkPackageRead]


class DashboardSharedLayoutRead(BaseModel):
    widgets: list[str]
    version: int
    updated_at: datetime
    updated_by_name: str


class DashboardLayoutRead(BaseModel):
    """The effective layout and the inheritance source behind it."""

    widgets: list[str]
    updated_at: datetime | None
    is_default: bool
    source: Literal["personal", "shared", "builtin"]
    shared_layout: DashboardSharedLayoutRead | None
    can_manage_shared: bool


class DashboardLayoutPut(BaseModel):
    widgets: list[str]


class DashboardSharedLayoutPut(BaseModel):
    widgets: list[str]
    expected_version: int = Field(ge=0, le=MAX_INT4)
