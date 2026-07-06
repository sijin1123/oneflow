import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

KEY_RE = re.compile(r"^[A-Z][A-Z0-9]{1,9}$")
MAX_DESCRIPTION = 20_000


class ProjectCreate(BaseModel):
    name: str
    key: str
    description: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 120:
            raise ValueError("name must be 1-120 chars after trim")
        return v

    @field_validator("key")
    @classmethod
    def _key(cls, v: str) -> str:
        if not KEY_RE.match(v):
            raise ValueError("key must match ^[A-Z][A-Z0-9]{1,9}$")
        return v

    @field_validator("description")
    @classmethod
    def _desc(cls, v: str | None) -> str | None:
        if v is not None and len(v) > MAX_DESCRIPTION:
            raise ValueError(f"description exceeds {MAX_DESCRIPTION} chars")
        return v


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    budget: float | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not 1 <= len(v) <= 120:
            raise ValueError("name must be 1-120 chars after trim")
        return v

    @field_validator("budget")
    @classmethod
    def _budget(cls, v: float | None) -> float | None:
        if v is not None and not 0 <= v <= 1_000_000_000_000:
            raise ValueError("budget out of range")
        return v


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    name: str
    description: str | None
    budget: float | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ProjectList(BaseModel):
    items: list[ProjectRead]
    total: int
