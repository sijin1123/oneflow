import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.models.work_package import WP_PRIORITIES, WP_STATUSES, WP_TYPES

MAX_DESCRIPTION = 20_000


def _check_dates(start: date | None, due: date | None) -> None:
    if start is not None and due is not None and start > due:
        raise ValueError("start_date must be <= due_date")


class WorkPackageCreate(BaseModel):
    subject: str
    description: str | None = None
    type: str = "task"
    status: str = "backlog"
    priority: str = "none"
    assignee_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    start_date: date | None = None
    due_date: date | None = None

    @field_validator("subject")
    @classmethod
    def _subject(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 255:
            raise ValueError("subject must be 1-255 chars after trim")
        return v

    @field_validator("description")
    @classmethod
    def _desc(cls, v: str | None) -> str | None:
        if v is not None and len(v) > MAX_DESCRIPTION:
            raise ValueError(f"description exceeds {MAX_DESCRIPTION} chars")
        return v

    @field_validator("type")
    @classmethod
    def _type(cls, v: str) -> str:
        if v not in WP_TYPES:
            raise ValueError(f"type must be one of {WP_TYPES}")
        return v

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in WP_STATUSES:
            raise ValueError(f"status must be one of {WP_STATUSES}")
        return v

    @field_validator("priority")
    @classmethod
    def _priority(cls, v: str) -> str:
        if v not in WP_PRIORITIES:
            raise ValueError(f"priority must be one of {WP_PRIORITIES}")
        return v

    @model_validator(mode="after")
    def _dates(self) -> "WorkPackageCreate":
        _check_dates(self.start_date, self.due_date)
        return self


class WorkPackagePatch(BaseModel):
    """Partial update. Explicit null on nullable fields = clear; omitted = unchanged.
    subject/status/priority/type reject null (enforced in the endpoint via
    model_fields_set). expected_version is the optimistic-concurrency token (§6.2)."""

    expected_version: int
    subject: str | None = None
    description: str | None = None
    type: str | None = None
    status: str | None = None
    priority: str | None = None
    assignee_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    start_date: date | None = None
    due_date: date | None = None

    @field_validator("expected_version")
    @classmethod
    def _version(cls, v: int) -> int:
        # int4 column bounds: out-of-range tokens are a client error (422),
        # never an asyncpg bind failure surfacing as 500 (review finding #7).
        if not 0 <= v <= 2_147_483_647:
            raise ValueError("expected_version must be between 0 and 2147483647")
        return v

    @field_validator("subject")
    @classmethod
    def _subject(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not 1 <= len(v) <= 255:
            raise ValueError("subject must be 1-255 chars after trim")
        return v

    @field_validator("description")
    @classmethod
    def _desc(cls, v: str | None) -> str | None:
        if v is not None and len(v) > MAX_DESCRIPTION:
            raise ValueError(f"description exceeds {MAX_DESCRIPTION} chars")
        return v

    @field_validator("type")
    @classmethod
    def _type(cls, v: str | None) -> str | None:
        if v is not None and v not in WP_TYPES:
            raise ValueError(f"type must be one of {WP_TYPES}")
        return v

    @field_validator("status")
    @classmethod
    def _status(cls, v: str | None) -> str | None:
        if v is not None and v not in WP_STATUSES:
            raise ValueError(f"status must be one of {WP_STATUSES}")
        return v

    @field_validator("priority")
    @classmethod
    def _priority(cls, v: str | None) -> str | None:
        if v is not None and v not in WP_PRIORITIES:
            raise ValueError(f"priority must be one of {WP_PRIORITIES}")
        return v


class WorkPackageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    subject: str
    description: str | None
    type: str
    status: str
    priority: str
    assignee_id: uuid.UUID | None
    parent_id: uuid.UUID | None
    start_date: date | None
    due_date: date | None
    version: int
    created_at: datetime
    updated_at: datetime


class WorkPackageList(BaseModel):
    items: list[WorkPackageRead]
    total: int


class RelationCreate(BaseModel):
    target_id: uuid.UUID
    relation_type: str

    @field_validator("relation_type")
    @classmethod
    def _rt(cls, v: str) -> str:
        from app.models.relation import RELATION_TYPES

        if v not in RELATION_TYPES:
            raise ValueError(f"relation_type must be one of {RELATION_TYPES}")
        return v


class RelationRead(BaseModel):
    id: uuid.UUID
    source_id: uuid.UUID
    target_id: uuid.UUID
    relation_type: str
    direction: str  # "outgoing" | "incoming"


class RelationList(BaseModel):
    items: list[RelationRead]
    total: int


class ConflictResponse(BaseModel):
    """409 body for PATCH optimistic-concurrency conflicts (§6.1 single contract)."""

    detail: str
    current: WorkPackageRead
