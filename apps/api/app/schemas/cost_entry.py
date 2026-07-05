import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.cost_entry import COST_KINDS


class CostEntryCreate(BaseModel):
    amount: float = Field(gt=0, le=100_000_000)
    kind: str = "labor"
    spent_on: date | None = None  # defaults to today in the endpoint
    comment: str | None = None

    @field_validator("amount")
    @classmethod
    def _amount_scale(cls, v: float) -> float:
        # amount is Numeric(12,2): a value in (0, 0.005) rounds to 0.00 and would trip
        # the DB `amount > 0` CHECK as an unhandled 500. Reject it as a 422 up front.
        if Decimal(str(v)).quantize(Decimal("0.01")) <= 0:
            raise ValueError("amount must be at least 0.01")
        return v

    @field_validator("kind")
    @classmethod
    def _kind(cls, v: str) -> str:
        if v not in COST_KINDS:
            raise ValueError(f"kind must be one of {COST_KINDS}")
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


class CostEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    work_package_id: uuid.UUID
    user_id: uuid.UUID | None
    amount: float
    kind: str
    spent_on: date
    comment: str | None
    created_at: datetime


class CostEntryList(BaseModel):
    items: list[CostEntryRead]
    total: int
    total_amount: float
