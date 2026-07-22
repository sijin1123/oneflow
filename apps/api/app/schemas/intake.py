import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, field_validator

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
    `snooze_until` only pairs with 'snoozed'. `note` is optional PLAIN TEXT
    (v29.1 — no HTML surface; trim-empty normalizes to null)."""

    status: str
    snooze_until: date | None = None
    note: str | None = None

    @field_validator("note")
    @classmethod
    def _note(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None  # whitespace-only → null (R1-③)
        if len(v) > 2000:
            raise ValueError("note must be at most 2000 chars after trim")
        return v

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
    # Final-decision audit — id only (display name resolves client-side; no
    # email or profile fields ride along — v29.1 R1-②).
    triage_note: str | None = None
    triaged_by_id: uuid.UUID | None = None
    triaged_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class IntakeList(BaseModel):
    items: list[IntakeRead]
    total: int


class IntakeDecisionHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    intake_item_id: uuid.UUID
    previous_status: str
    status: str
    note: str | None
    snooze_until: date | None
    decided_by: uuid.UUID | None
    decided_by_name: str | None = None
    decided_by_profile_image_url: str | None = None
    created_at: datetime


class IntakeDecisionHistoryList(BaseModel):
    items: list[IntakeDecisionHistoryRead]
    total: int
