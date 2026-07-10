import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

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
    converted_wp_id: uuid.UUID | None
    created_at: datetime


RECURRENCES = ("weekly", "biweekly", "monthly")


class MeetingCreate(BaseModel):
    title: str
    scheduled_on: date | None = None
    # Recurrence preset (Pass 69) — requires a date (validated in the router
    # against the MERGED state for PATCH).
    recurrence: str | None = None
    # Applying a template COPIES its agenda at create time (same-transaction
    # lookup — a deleted template is a plain 404; v48.1 R1-④).
    template_id: uuid.UUID | None = None

    @field_validator("recurrence")
    @classmethod
    def _recurrence(cls, v: str | None) -> str | None:
        if v is not None and v not in RECURRENCES:
            raise ValueError(f"recurrence must be one of {RECURRENCES}")
        return v

    @field_validator("title")
    @classmethod
    def _t(cls, v: str) -> str:
        return _title(v)


class MeetingFollowUpCreate(BaseModel):
    """Follow-up meeting (Pass 34 PR-AZ): agenda carries over; open UNCONVERTED
    action items are COPIED (never moved — the original meeting keeps its
    record); scheduled_on defaults to the source date + 7 days."""

    scheduled_on: date | None = None
    carry_open_items: bool = True


class MeetingUpdate(BaseModel):
    expected_version: int
    title: str | None = None
    scheduled_on: date | None = None
    agenda: str | None = None
    minutes: str | None = None
    recurrence: str | None = None

    @field_validator("expected_version")
    @classmethod
    def _v(cls, v: int) -> int:
        if not 0 <= v <= 2_147_483_647:
            raise ValueError("expected_version must be between 0 and 2147483647")
        return v

    @field_validator("recurrence")
    @classmethod
    def _recurrence(cls, v: str | None) -> str | None:
        if v is not None and v not in RECURRENCES:
            raise ValueError(f"recurrence must be one of {RECURRENCES}")
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
    recurrence: str | None = None
    recurrence_source_id: uuid.UUID | None = None
    follow_up_source_id: uuid.UUID | None = None
    follow_up_source_title: str | None = None
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
    recurrence: str | None = None
    version: int
    updated_at: datetime


class MeetingList(BaseModel):
    items: list[MeetingListItem]
    total: int


class MeetingConflict(BaseModel):
    detail: str
    current: MeetingRead


class MeetingTemplateCreate(BaseModel):
    """agenda XOR from_meeting_id (v48.1 R1-①): both or neither is a 422."""

    name: str
    agenda: str | None = None
    from_meeting_id: uuid.UUID | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 80:
            raise ValueError("name must be 1-80 chars after trim")
        return v

    @field_validator("agenda")
    @classmethod
    def _agenda(cls, v: str | None) -> str | None:
        return _rich(v)

    @model_validator(mode="after")
    def _source(self) -> "MeetingTemplateCreate":
        if (self.agenda is None) == (self.from_meeting_id is None):
            raise ValueError("provide exactly one of agenda or from_meeting_id")
        return self


class MeetingTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    agenda: str | None
    created_by: uuid.UUID | None
    created_at: datetime


class MeetingTemplateList(BaseModel):
    items: list[MeetingTemplateRead]
    total: int
