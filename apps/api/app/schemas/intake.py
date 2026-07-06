import uuid
from datetime import date, datetime

from pydantic import BaseModel, field_validator

from app.models.intake import INTAKE_STATUSES


class IntakeCreate(BaseModel):
    title: str
    body: str | None = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 255:
            raise ValueError("title must be 1-255 chars after trim")
        return v


class IntakeTriage(BaseModel):
    """Owner triage decision. `status` must be a decision (not 'pending');
    `snooze_until` only pairs with 'snoozed'."""

    status: str
    snooze_until: date | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in INTAKE_STATUSES or v == "pending":
            raise ValueError("status must be one of accepted/declined/snoozed/duplicate")
        return v


class IntakeRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    body: str | None
    status: str
    submitted_by: uuid.UUID | None
    submitter_name: str | None
    snooze_until: date | None
    accepted_wp_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class IntakeList(BaseModel):
    items: list[IntakeRead]
    total: int
