import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

ScheduleVarianceState = Literal[
    "unchanged",
    "later",
    "earlier",
    "unscheduled",
    "rescheduled",
    "added",
    "removed",
]


class ProjectScheduleBaselineMutation(BaseModel):
    expected_version: int | None = Field(default=None, ge=0)


class ProjectScheduleBaselineRead(BaseModel):
    id: uuid.UUID
    version: int
    captured_at: datetime
    captured_by_user_id: uuid.UUID | None


class ProjectScheduleVarianceItem(BaseModel):
    work_package_id: uuid.UUID
    subject: str
    state: ScheduleVarianceState
    variance_days: int | None
    baseline_start_date: date | None
    baseline_due_date: date | None
    current_start_date: date | None
    current_due_date: date | None


class ProjectScheduleBaselineSummary(BaseModel):
    baseline: ProjectScheduleBaselineRead | None
    total_snapshot: int
    current_total: int
    unchanged: int
    later: int
    earlier: int
    unscheduled: int
    rescheduled: int
    added: int
    removed: int
    changed_total: int
    items: list[ProjectScheduleVarianceItem]
    items_truncated: bool
