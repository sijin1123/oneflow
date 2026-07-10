import uuid
from datetime import datetime

from pydantic import BaseModel


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


class DashboardLayoutRead(BaseModel):
    """v18.1 R1-⑤: is_default marks the built-in layout (no row persisted);
    updated_at is null in that case. PUT echoes the NORMALIZED array."""

    widgets: list[str]
    updated_at: datetime | None
    is_default: bool


class DashboardLayoutPut(BaseModel):
    widgets: list[str]
