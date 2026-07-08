import uuid
from datetime import date, datetime

from pydantic import BaseModel, field_validator

from app.models.module import MODULE_STATES


def _clean_name(v: str) -> str:
    v = v.strip()
    if not 1 <= len(v) <= 120:
        raise ValueError("name must be 1-120 chars after trim")
    return v


def _check_state(v: str) -> str:
    if v not in MODULE_STATES:
        raise ValueError(f"state must be one of {MODULE_STATES}")
    return v


class ModuleCreate(BaseModel):
    name: str
    description: str | None = None
    lead_id: uuid.UUID | None = None
    state: str = "planned"
    start_date: date | None = None
    target_date: date | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _clean_name(v)

    @field_validator("state")
    @classmethod
    def _state(cls, v: str) -> str:
        return _check_state(v)


class ModuleUpdate(BaseModel):
    """Partial update — the cross-field date check runs in the router against
    the MERGED values (dates are optional here, unlike cycles)."""

    name: str | None = None
    description: str | None = None
    lead_id: uuid.UUID | None = None
    state: str | None = None
    start_date: date | None = None
    target_date: date | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return None if v is None else _clean_name(v)

    @field_validator("state")
    @classmethod
    def _state(cls, v: str | None) -> str | None:
        return None if v is None else _check_state(v)


class ModuleRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None
    lead_id: uuid.UUID | None
    state: str
    start_date: date | None
    target_date: date | None
    # Progress rollup (single aggregate query — see the router).
    work_package_count: int
    done_work_package_count: int
    # Currently-ELIGIBLE participants (active AND member AND role != viewer —
    # Pass 65 v65.1; independent aggregate, never a join into the row query).
    member_count: int = 0
    created_at: datetime
    updated_at: datetime


class ModuleList(BaseModel):
    items: list[ModuleRead]
    total: int


class ModuleMemberRead(BaseModel):
    user_id: uuid.UUID
    display_name: str
    email: str


class ModuleMemberList(BaseModel):
    items: list[ModuleMemberRead]
    total: int


class ModuleMembersPut(BaseModel):
    """Full-replace roster (idempotent; duplicates collapse; [] clears).
    Every id must be currently eligible or the whole request is refused."""

    user_ids: list[uuid.UUID]
