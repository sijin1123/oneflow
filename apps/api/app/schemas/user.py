import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

# Same house pattern as member.py — no email-validator dependency.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    is_active: bool
    is_admin: bool


class UserDirectoryRead(UserRead):
    """Directory row for workspace admins (/api/v1/users)."""

    created_at: datetime


class UserDirectoryList(BaseModel):
    items: list[UserDirectoryRead]
    total: int


class UserMembershipRead(BaseModel):
    """One project membership row for the workspace governance read
    (Pass 62 PR-CB) — deliberately minimal fields (v62.1 R1-(2))."""

    project_id: uuid.UUID
    project_key: str
    project_name: str
    role: str
    archived: bool


class UserMembershipList(BaseModel):
    items: list[UserMembershipRead]
    total: int


def _clean_display_name(v: str) -> str:
    v = v.strip()
    if not 1 <= len(v) <= 120:
        raise ValueError("display_name must be 1-120 chars after trim")
    return v


class UserCreate(BaseModel):
    """Directory registration — no invite email; real login wiring is the
    OIDC pass. Email normalizes to a lowercase login key (mutable, never a
    stable id)."""

    email: str
    display_name: str

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if len(v) > 255 or not _EMAIL_RE.match(v):
            raise ValueError("invalid email")
        return v

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _clean_display_name(v)


class UserUpdate(BaseModel):
    """Admin-only partial update. Guards live in the endpoint: no
    self-deactivation, and the last admin can neither lose the flag nor be
    deactivated."""

    display_name: str | None = None
    is_active: bool | None = None
    is_admin: bool | None = None

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return None if v is None else _clean_display_name(v)
