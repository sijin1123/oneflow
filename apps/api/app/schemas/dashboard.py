from datetime import datetime

from pydantic import BaseModel


class Bucket(BaseModel):
    key: str
    count: int


class DashboardRead(BaseModel):
    total_work_packages: int
    open_work_packages: int  # not done/cancelled
    overdue_count: int  # due_date < today and still open
    status_counts: list[Bucket]
    priority_counts: list[Bucket]
    type_counts: list[Bucket]
    total_estimated_hours: float
    total_spent_hours: float
    budget: float | None
    total_cost: float


class DashboardLayoutRead(BaseModel):
    """v18.1 R1-⑤: is_default marks the built-in layout (no row persisted);
    updated_at is null in that case. PUT echoes the NORMALIZED array."""

    widgets: list[str]
    updated_at: datetime | None
    is_default: bool


class DashboardLayoutPut(BaseModel):
    widgets: list[str]
