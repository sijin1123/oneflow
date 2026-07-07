import uuid
from datetime import date, datetime

from pydantic import BaseModel, field_validator

from app.models.initiative import INITIATIVE_STATES


def _clean_name(v: str) -> str:
    v = v.strip()
    if not 1 <= len(v) <= 120:
        raise ValueError("name must be 1-120 chars after trim")
    return v


def _check_state(v: str) -> str:
    if v not in INITIATIVE_STATES:
        raise ValueError(f"state must be one of {INITIATIVE_STATES}")
    return v


class InitiativeCreate(BaseModel):
    name: str
    description: str | None = None
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


class InitiativeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
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


class InitiativeProjectRead(BaseModel):
    """A connected project AS VISIBLE TO THE CALLER (member projects only)."""

    project_id: uuid.UUID
    project_name: str
    work_package_count: int
    done_work_package_count: int


class InitiativeRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    owner_id: uuid.UUID | None
    owner_name: str | None
    state: str
    start_date: date | None
    target_date: date | None
    is_mine: bool
    # Total connections vs the subset the caller can see — the UI shows
    # "N개 프로젝트 (내가 볼 수 있는 M개)" when they differ.
    connected_project_count: int
    projects: list[InitiativeProjectRead]
    created_at: datetime
    updated_at: datetime


class InitiativeList(BaseModel):
    items: list[InitiativeRead]
    total: int


class InitiativeConnect(BaseModel):
    project_id: uuid.UUID
