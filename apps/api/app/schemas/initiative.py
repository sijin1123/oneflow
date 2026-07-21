import re
import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.models.initiative import INITIATIVE_STATES
from app.schemas.project import PROJECT_HEALTH


def _clean_name(v: str) -> str:
    v = v.strip()
    if not 1 <= len(v) <= 120:
        raise ValueError("name must be 1-120 chars after trim")
    return v


def _check_state(v: str) -> str:
    if v not in INITIATIVE_STATES:
        raise ValueError(f"state must be one of {INITIATIVE_STATES}")
    return v


def _clean_label_name(value: str) -> str:
    value = " ".join(value.split())
    if not 1 <= len(value) <= 40:
        raise ValueError("label name must be 1-40 chars after trim")
    return value


def _clean_label_color(value: str) -> str:
    value = value.strip().lower()
    if re.fullmatch(r"#[0-9a-f]{6}", value) is None:
        raise ValueError("label color must be a 6-digit hex value")
    return value


class InitiativeLabelCreate(BaseModel):
    name: str
    color: str = "#64748b"

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _clean_label_name(value)

    @field_validator("color")
    @classmethod
    def _color(cls, value: str) -> str:
        return _clean_label_color(value)


class InitiativeLabelUpdate(BaseModel):
    name: str | None = None
    color: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        return None if value is None else _clean_label_name(value)

    @field_validator("color")
    @classmethod
    def _color(cls, value: str | None) -> str | None:
        return None if value is None else _clean_label_color(value)


class InitiativeLabelRead(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    created_at: datetime
    updated_at: datetime


class InitiativeLabelList(BaseModel):
    items: list[InitiativeLabelRead]
    total: int


class InitiativeLabelAssignmentUpdate(BaseModel):
    label_ids: list[uuid.UUID] = Field(max_length=8)

    @field_validator("label_ids")
    @classmethod
    def _unique(cls, values: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(values) != len(set(values)):
            raise ValueError("label_ids must be unique")
        return values


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
    # Health report (Pass 44 — the v37.1 transition table via the shared
    # helper): omitted = untouched; value = set + note ALWAYS replaced;
    # null = fully cleared. Last-write-wins by design (snapshot-only).
    health: str | None = None
    health_note: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return None if v is None else _clean_name(v)

    @field_validator("state")
    @classmethod
    def _state(cls, v: str | None) -> str | None:
        return None if v is None else _check_state(v)

    @field_validator("health")
    @classmethod
    def _health(cls, v: str | None) -> str | None:
        if v is not None and v not in PROJECT_HEALTH:
            raise ValueError(f"health must be one of {PROJECT_HEALTH}")
        return v

    @field_validator("health_note")
    @classmethod
    def _health_note(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            return None
        if len(v) > 2000:
            raise ValueError("health_note must be <= 2000 chars")
        return v


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
    owner_active: bool
    state: str
    start_date: date | None
    target_date: date | None
    health: str | None
    health_note: str | None
    # id only (v44.1 R1-⓪ — the owner_id precedent); the web resolves a name
    # from the caller's own rosters or falls back.
    health_updated_by: uuid.UUID | None
    health_updated_at: datetime | None
    is_mine: bool
    can_claim_ownership: bool
    # Total connections vs the subset the caller can see — the UI shows
    # "N개 프로젝트 (내가 볼 수 있는 M개)" when they differ.
    connected_project_count: int
    connected_work_item_count: int
    follower_count: int
    is_following: bool
    labels: list[InitiativeLabelRead]
    projects: list[InitiativeProjectRead]
    created_at: datetime
    updated_at: datetime


class InitiativeList(BaseModel):
    items: list[InitiativeRead]
    total: int


class InitiativeActivityRead(BaseModel):
    id: uuid.UUID
    actor_id: uuid.UUID | None
    actor_name: str | None
    actor_profile_image_url: str | None
    kind: str
    changed_fields: list[str]
    created_at: datetime


class InitiativeActivityList(BaseModel):
    items: list[InitiativeActivityRead]
    total: int


class InitiativeConnect(BaseModel):
    project_id: uuid.UUID


class InitiativeWorkItemConnect(BaseModel):
    work_package_id: uuid.UUID


class InitiativeWorkItemRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_name: str
    subject: str
    status: str
    priority: str
    assignee_id: uuid.UUID | None
    due_date: date | None


class InitiativeWorkItemList(BaseModel):
    items: list[InitiativeWorkItemRead]
    total: int
    connected_work_item_count: int


class InitiativeWorkItemCandidateList(BaseModel):
    items: list[InitiativeWorkItemRead]
    total: int


class InitiativeOwnerCandidateRead(BaseModel):
    user_id: uuid.UUID
    display_name: str


class InitiativeOwnerCandidateList(BaseModel):
    items: list[InitiativeOwnerCandidateRead]
    total: int


class InitiativeOwnerTransfer(BaseModel):
    owner_id: uuid.UUID


class InitiativeSubscriptionRead(BaseModel):
    is_following: bool
    follower_count: int
