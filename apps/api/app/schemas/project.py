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
    # Use an existing project as a settings template (Pass 15 — statuses/types/
    # custom fields/automation copied; NO content, NO members).
    template_project_id: uuid.UUID | None = None

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


PROJECT_HEALTH = ("on_track", "at_risk", "off_track")


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    cover_attachment_id: uuid.UUID | None = None
    budget: float | None = None
    # Health report (Pass 37, v37.1 transition table): omitted = untouched;
    # a VALUE sets it and ALWAYS replaces the note (omitted note → null —
    # Pass 29 precedent); null clears all health fields (note alongside = 422
    # in the endpoint). Note is part of the report — never standalone.
    health: str | None = None
    health_note: str | None = None

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


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    name: str
    description: str | None
    cover_attachment_id: uuid.UUID | None
    budget: float | None
    archived_at: datetime | None
    health: str | None
    health_note: str | None
    health_updated_by: uuid.UUID | None
    health_updated_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ProjectHealthHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    previous_health: str | None
    previous_note: str | None
    health: str | None
    note: str | None
    changed_by: uuid.UUID | None
    changed_by_name: str | None = None
    changed_by_profile_image_url: str | None = None
    created_at: datetime


class ProjectHealthHistoryList(BaseModel):
    items: list[ProjectHealthHistoryRead]
    total: int


class TemplateApplied(BaseModel):
    """Copy counts when a project was created from a template (never silent)."""

    statuses: int
    types: int
    custom_fields: int
    automation_rules: int


class ProjectCreateResponse(ProjectRead):
    """POST /projects response — additive: template_applied is null unless a
    template was used, so existing clients are unaffected (v15.1 R1-⑤)."""

    template_applied: TemplateApplied | None = None


class ProjectListItem(ProjectRead):
    """List row with portfolio rollups (Pass 22, additive). member_count =
    current project_members rows, any role (a deleted user cannot appear —
    users FK CASCADE); overdue = due_date < UTC-today AND status open."""

    work_package_count: int = 0
    open_work_package_count: int = 0
    overdue_count: int = 0
    member_count: int = 0
    current_user_role: str
    # Initiative rollup (Pass 51, v51.1): top 5 by name (connection implies
    # visibility — every listed project is the caller's), plus the overflow
    # count beyond the cap. Empty list when unconnected.
    initiatives: list["ProjectInitiativeRef"] = []
    initiative_overflow: int = 0


class ProjectList(BaseModel):
    items: list[ProjectListItem]
    total: int


class ProjectInitiativeRef(BaseModel):
    id: uuid.UUID
    name: str
