import uuid
from datetime import date, datetime

from pydantic import BaseModel, field_validator, model_validator


def _clean_name(v: str) -> str:
    v = v.strip()
    if not 1 <= len(v) <= 120:
        raise ValueError("name must be 1-120 chars after trim")
    return v


class CycleCreate(BaseModel):
    name: str
    description: str | None = None
    start_date: date
    end_date: date

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _clean_name(v)

    @model_validator(mode="after")
    def _dates(self) -> "CycleCreate":
        if self.start_date > self.end_date:
            raise ValueError("start_date must be on or before end_date")
        return self


class CycleUpdate(BaseModel):
    """Partial update — the cross-field date check runs in the router against
    the MERGED values, so changing one bound cannot invert the range."""

    name: str | None = None
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return None if v is None else _clean_name(v)


class CycleRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None
    start_date: date
    end_date: date
    # Derived from the date range vs the server-local date, never stored.
    status: str
    # Progress rollup (single aggregate query — see the router).
    work_package_count: int
    done_work_package_count: int
    created_at: datetime
    updated_at: datetime


class CycleList(BaseModel):
    items: list[CycleRead]
    total: int
