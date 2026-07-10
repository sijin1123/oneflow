import json
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.work_package import WP_PRIORITIES, WP_STATUSES, WP_TYPES

MAX_INT4 = 2_147_483_647
MAX_DRAFT_BYTES = 256 * 1024


class WorkItemDraftContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: str = Field(default="", max_length=255)
    type: str = "task"
    status: str = "backlog"
    priority: str = "none"
    assignee_id: uuid.UUID | None = None
    due_date: date | None = None

    @field_validator("type")
    @classmethod
    def _type(cls, value: str) -> str:
        if value not in WP_TYPES:
            raise ValueError(f"type must be one of {WP_TYPES}")
        return value

    @field_validator("status")
    @classmethod
    def _status(cls, value: str) -> str:
        if value not in WP_STATUSES:
            raise ValueError(f"status must be one of {WP_STATUSES}")
        return value

    @field_validator("priority")
    @classmethod
    def _priority(cls, value: str) -> str:
        if value not in WP_PRIORITIES:
            raise ValueError(f"priority must be one of {WP_PRIORITIES}")
        return value

    @model_validator(mode="after")
    def _bounded_payload(self) -> "WorkItemDraftContent":
        encoded = json.dumps(
            self.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":")
        ).encode()
        if len(encoded) > MAX_DRAFT_BYTES:
            raise ValueError(f"draft content exceeds {MAX_DRAFT_BYTES} bytes")
        return self


class WorkItemDraftCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: WorkItemDraftContent = Field(default_factory=WorkItemDraftContent)


class WorkItemDraftReplace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=0, le=MAX_INT4)
    content: WorkItemDraftContent


class WorkItemDraftSubmit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=0, le=MAX_INT4)


class WorkItemDraftRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    content: WorkItemDraftContent
    version: int
    created_at: datetime
    updated_at: datetime


class WorkItemDraftList(BaseModel):
    items: list[WorkItemDraftRead]
    total: int
    limit: int
    offset: int


class WorkItemDraftError(BaseModel):
    detail: str


class WorkItemDraftConflict(BaseModel):
    detail: str = "draft was changed elsewhere"
    current: WorkItemDraftRead
