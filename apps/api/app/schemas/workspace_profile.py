import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, field_validator


class WorkspaceIdentityRead(BaseModel):
    name: str
    revision: int


class WorkspaceProfileRead(WorkspaceIdentityRead):
    id: int
    updated_by_user_id: uuid.UUID | None
    updated_by_name: str | None
    updated_at: datetime


class WorkspaceProfileUpdate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 80:
            raise ValueError("name must be 1-80 chars after trim")
        return value


WorkingWeekday = Literal[0, 1, 2, 3, 4, 5, 6]


class WorkspaceCalendarRead(BaseModel):
    working_weekdays: list[WorkingWeekday]
    holidays: list[date]
    revision: int
    updated_by_user_id: uuid.UUID | None
    updated_by_name: str | None
    updated_at: datetime


class WorkspaceCalendarUpdate(BaseModel):
    working_weekdays: list[WorkingWeekday]
    holidays: list[date]

    @field_validator("working_weekdays")
    @classmethod
    def _weekdays(cls, value: list[WorkingWeekday]) -> list[WorkingWeekday]:
        normalized = sorted(set(value))
        if not normalized:
            raise ValueError("at least one working weekday is required")
        return normalized

    @field_validator("holidays")
    @classmethod
    def _holidays(cls, value: list[date]) -> list[date]:
        normalized = sorted(set(value))
        if len(normalized) > 366:
            raise ValueError("holidays cannot exceed 366 dates")
        return normalized
