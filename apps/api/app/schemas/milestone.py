import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, field_validator


class MilestoneCreate(BaseModel):
    name: str
    description: str | None = None
    due_date: date | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 120:
            raise ValueError("name must be 1-120 chars after trim")
        return v


class MilestoneUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    due_date: date | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not 1 <= len(v) <= 120:
            raise ValueError("name must be 1-120 chars after trim")
        return v


class MilestoneRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None
    due_date: date | None
    created_at: datetime
    updated_at: datetime


class MilestoneList(BaseModel):
    items: list[MilestoneRead]
    total: int
