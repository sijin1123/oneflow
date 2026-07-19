import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.permissions import DELEGABLE_PROJECT_PERMISSIONS

MAX_CUSTOM_PROJECT_ROLES = 50
RESERVED_PROJECT_ROLE_NAMES = {"owner", "member", "viewer"}


def _name(value: str) -> str:
    value = value.strip()
    if not 1 <= len(value) <= 50:
        raise ValueError("name must be 1-50 chars after trim")
    if value.casefold() in RESERVED_PROJECT_ROLE_NAMES:
        raise ValueError("name is reserved for a built-in project role")
    return value


def _description(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if len(value) > 200:
        raise ValueError("description must be at most 200 chars")
    return value


def _permissions(value: list[str]) -> list[str]:
    if len(value) != len(set(value)):
        raise ValueError("permissions must be unique")
    unsupported = set(value) - set(DELEGABLE_PROJECT_PERMISSIONS)
    if unsupported:
        raise ValueError("permissions contain non-delegable project capabilities")
    selected = set(value)
    return [key for key in DELEGABLE_PROJECT_PERMISSIONS if key in selected]


class ProjectRoleCapability(BaseModel):
    key: str
    label: str
    note: str | None


class ProjectRoleCapabilityList(BaseModel):
    items: list[ProjectRoleCapability]
    total: int


class ProjectRoleCatalogItem(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    permissions: list[str]
    revision: int


class ProjectRoleCatalogList(BaseModel):
    items: list[ProjectRoleCatalogItem]
    total: int


class ProjectRoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    permissions: list[str]
    revision: int
    archived_at: datetime | None
    assigned_member_count: int
    created_by_user_id: uuid.UUID | None
    created_by_name: str
    updated_by_user_id: uuid.UUID | None
    updated_by_name: str
    created_at: datetime
    updated_at: datetime


class ProjectRoleList(BaseModel):
    items: list[ProjectRoleRead]
    total: int


class ProjectRoleEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role_id: uuid.UUID
    actor_id: uuid.UUID | None
    actor_name: str
    event_type: str
    revision: int
    snapshot: dict
    created_at: datetime


class ProjectRoleEventList(BaseModel):
    items: list[ProjectRoleEventRead]
    total: int
    limit: int
    offset: int


class ProjectRoleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    description: str | None = None
    permissions: list[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _valid_name(cls, value: str) -> str:
        return _name(value)

    @field_validator("description")
    @classmethod
    def _valid_description(cls, value: str | None) -> str | None:
        return _description(value)

    @field_validator("permissions")
    @classmethod
    def _valid_permissions(cls, value: list[str]) -> list[str]:
        return _permissions(value)


class ProjectRoleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int
    name: str | None = None
    description: str | None = None
    permissions: list[str] | None = None

    @field_validator("expected_revision")
    @classmethod
    def _valid_revision(cls, value: int) -> int:
        if value < 1:
            raise ValueError("expected_revision must be positive")
        return value

    @field_validator("name")
    @classmethod
    def _valid_name(cls, value: str | None) -> str | None:
        return None if value is None else _name(value)

    @field_validator("description")
    @classmethod
    def _valid_description(cls, value: str | None) -> str | None:
        return _description(value)

    @field_validator("permissions")
    @classmethod
    def _valid_permissions(cls, value: list[str] | None) -> list[str] | None:
        return None if value is None else _permissions(value)

    @model_validator(mode="after")
    def _has_change(self) -> "ProjectRoleUpdate":
        supplied = self.model_fields_set - {"expected_revision"}
        if not supplied:
            raise ValueError("at least one role field is required")
        if "name" in supplied and self.name is None:
            raise ValueError("name cannot be null")
        return self


class ProjectRoleRevision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int

    @field_validator("expected_revision")
    @classmethod
    def _valid_revision(cls, value: int) -> int:
        if value < 1:
            raise ValueError("expected_revision must be positive")
        return value
