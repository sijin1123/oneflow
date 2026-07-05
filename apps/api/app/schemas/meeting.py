import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, field_validator

MAX_RICH = 100_000


def _title(v: str) -> str:
    v = v.strip()
    if not 1 <= len(v) <= 200:
        raise ValueError("title must be 1-200 chars after trim")
    return v


def _rich(v: str | None) -> str | None:
    if v is not None and len(v) > MAX_RICH:
        raise ValueError(f"field exceeds {MAX_RICH} chars")
    return v


class ActionItemCreate(BaseModel):
    description: str
    assignee_id: uuid.UUID | None = None

    @field_validator("description")
    @classmethod
    def _desc(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 500:
            raise ValueError("description must be 1-500 chars after trim")
        return v


class ActionItemUpdate(BaseModel):
    done: bool


class ActionItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    meeting_id: uuid.UUID
    description: str
    assignee_id: uuid.UUID | None
    done: bool
    created_at: datetime


class MeetingCreate(BaseModel):
    title: str
    scheduled_on: date | None = None

    @field_validator("title")
    @classmethod
    def _t(cls, v: str) -> str:
        return _title(v)


class MeetingUpdate(BaseModel):
    expected_version: int
    title: str | None = None
    scheduled_on: date | None = None
    agenda: str | None = None
    minutes: str | None = None

    @field_validator("expected_version")
    @classmethod
    def _v(cls, v: int) -> int:
        if not 0 <= v <= 2_147_483_647:
            raise ValueError("expected_version must be between 0 and 2147483647")
        return v

    @field_validator("title")
    @classmethod
    def _t(cls, v: str | None) -> str | None:
        return None if v is None else _title(v)

    @field_validator("agenda")
    @classmethod
    def _a(cls, v: str | None) -> str | None:
        return _rich(v)

    @field_validator("minutes")
    @classmethod
    def _m(cls, v: str | None) -> str | None:
        return _rich(v)


class MeetingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    scheduled_on: date | None
    agenda: str | None
    minutes: str | None
    author_id: uuid.UUID | None
    version: int
    created_at: datetime
    updated_at: datetime
    action_items: list[ActionItemRead] = []


class MeetingListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    scheduled_on: date | None
    version: int
    updated_at: datetime


class MeetingList(BaseModel):
    items: list[MeetingListItem]
    total: int


class MeetingConflict(BaseModel):
    detail: str
    current: MeetingRead
