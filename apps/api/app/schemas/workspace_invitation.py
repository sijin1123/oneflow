import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
InvitationStatus = Literal["pending", "accepted", "revoked", "expired"]


def _email(value: str) -> str:
    value = value.strip().lower()
    if len(value) > 255 or not _EMAIL_RE.match(value):
        raise ValueError("invalid email")
    return value


def _display_name(value: str) -> str:
    value = value.strip()
    if not 1 <= len(value) <= 120:
        raise ValueError("display_name must be 1-120 chars after trim")
    return value


class WorkspaceInvitationCreate(BaseModel):
    email: str
    display_name: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return _email(value)

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        return _display_name(value)


class WorkspaceInvitationRead(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    status: InvitationStatus
    expires_at: datetime
    accepted_at: datetime | None
    revoked_at: datetime | None
    version: int
    created_at: datetime


class WorkspaceInvitationList(BaseModel):
    items: list[WorkspaceInvitationRead]
    total: int


class WorkspaceInvitationSecret(WorkspaceInvitationRead):
    token: str


class WorkspaceInvitationMutation(BaseModel):
    expected_version: int


class WorkspaceInvitationToken(BaseModel):
    token: str

    @field_validator("token")
    @classmethod
    def validate_token(cls, value: str) -> str:
        value = value.strip()
        if not 32 <= len(value) <= 256 or any(ord(char) < 33 or ord(char) > 126 for char in value):
            raise ValueError("invalid invitation token")
        return value


class WorkspaceInvitationPreview(BaseModel):
    display_name: str
    masked_email: str
    status: InvitationStatus
    expires_at: datetime


class WorkspaceInvitationAccepted(BaseModel):
    email: str
    display_name: str
    login_path: str = "/login"
