import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

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


class ProjectScheduleBaselineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("baseline name must not be blank")
        return normalized


class ProjectScheduleBaselineRead(BaseModel):
    id: uuid.UUID
    name: str
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


class ProjectScheduleBaselineListItem(ProjectScheduleBaselineRead):
    total_snapshot: int
    comparison_total: int
    changed_total: int
    risk_total: int


class ProjectScheduleBaselineList(BaseModel):
    items: list[ProjectScheduleBaselineListItem]
    total: int
    current_total: int
    limit: int
