import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TimeEntryCreate(BaseModel):
    hours: float = Field(gt=0, le=1000)
    spent_on: date | None = None  # defaults to today in the endpoint
    comment: str | None = None

    @field_validator("hours")
    @classmethod
    def _hours_scale(cls, v: float) -> float:
        # hours is Numeric(6,2): a value in (0, 0.005) rounds to 0.00 and would trip
        # the DB `hours > 0` CHECK as an unhandled 500. Reject it as a 422 up front.
        if Decimal(str(v)).quantize(Decimal("0.01")) <= 0:
            raise ValueError("hours must be at least 0.01")
        return v

    @field_validator("comment")
    @classmethod
    def _comment(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) > 500:
            raise ValueError("comment must be <= 500 chars")
        return v or None


class TimeEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    work_package_id: uuid.UUID
    user_id: uuid.UUID | None
    hours: float
    spent_on: date
    comment: str | None
    created_at: datetime


class TimeEntryList(BaseModel):
    items: list[TimeEntryRead]
    total: int
    total_hours: float
