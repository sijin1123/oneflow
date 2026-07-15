import re
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.auth_assistance_request import (
    AUTH_ASSISTANCE_KINDS,
    AUTH_ASSISTANCE_STATUSES,
)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _optional_text(value: str | None, *, limit: int) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if len(cleaned) > limit:
        raise ValueError(f"text must be at most {limit} chars after trim")
    return cleaned


class AuthAssistanceCreate(BaseModel):
    kind: str
    email: str
    reason: str | None = None

    @field_validator("kind")
    @classmethod
    def _kind(cls, value: str) -> str:
        if value not in AUTH_ASSISTANCE_KINDS:
            raise ValueError("unsupported assistance kind")
        return value

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if len(cleaned) > 255 or not _EMAIL_RE.match(cleaned):
            raise ValueError("invalid email")
        return cleaned

    @field_validator("reason")
    @classmethod
    def _reason(cls, value: str | None) -> str | None:
        return _optional_text(value, limit=1000)


class AuthAssistanceAccepted(BaseModel):
    accepted: bool = True
    message: str = "If assistance is available, a workspace administrator will review the request."


class AuthAssistanceTriage(BaseModel):
    status: str
    expected_version: int = Field(ge=1, le=2_147_483_647)
    note: str | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, value: str) -> str:
        if value not in AUTH_ASSISTANCE_STATUSES:
            raise ValueError("unsupported assistance status")
        return value

    @field_validator("note")
    @classmethod
    def _note(cls, value: str | None) -> str | None:
        return _optional_text(value, limit=2000)

    @model_validator(mode="after")
    def _terminal_note(self):
        if self.status in {"resolved", "rejected"} and self.note is None:
            raise ValueError("a note is required for a terminal decision")
        return self


class AuthAssistanceRead(BaseModel):
    id: uuid.UUID
    kind: str
    status: str
    email: str | None
    reason: str | None
    submission_count: int
    last_submitted_at: datetime
    version: int
    triage_note: str | None
    triaged_by_id: uuid.UUID | None
    triaged_at: datetime | None
    redacted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AuthAssistanceList(BaseModel):
    items: list[AuthAssistanceRead]
    total: int
    limit: int
    offset: int
