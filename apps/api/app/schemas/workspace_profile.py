import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.workspace_profile import (
    MAX_ACTIVE_PROJECT_PHASES,
    MAX_PROJECT_PHASE_DEFINITIONS,
    PROJECT_PHASE_KEYS,
)


class WorkspaceIdentityRead(BaseModel):
    name: str
    revision: int
    logo_url: str | None
    logo_content_type: str | None
    logo_filename: str | None
    logo_width: int | None
    logo_height: int | None
    logo_byte_size: int | None


class WorkspaceProfileRead(WorkspaceIdentityRead):
    id: int
    updated_by_user_id: uuid.UUID | None
    updated_by_name: str | None
    updated_at: datetime


class WorkspaceProfileUpdate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 80:
            raise ValueError("name must be 1-80 chars after trim")
        return value


WorkingWeekday = Literal[0, 1, 2, 3, 4, 5, 6]


class WorkspaceCalendarRead(BaseModel):
    working_weekdays: list[WorkingWeekday]
    holidays: list[date]
    revision: int
    updated_by_user_id: uuid.UUID | None
    updated_by_name: str | None
    updated_at: datetime


class WorkspaceCalendarUpdate(BaseModel):
    working_weekdays: list[WorkingWeekday]
    holidays: list[date]

    @field_validator("working_weekdays")
    @classmethod
    def _weekdays(cls, value: list[WorkingWeekday]) -> list[WorkingWeekday]:
        normalized = sorted(set(value))
        if not normalized:
            raise ValueError("at least one working weekday is required")
        return normalized

    @field_validator("holidays")
    @classmethod
    def _holidays(cls, value: list[date]) -> list[date]:
        normalized = sorted(set(value))
        if len(normalized) > 366:
            raise ValueError("holidays cannot exceed 366 dates")
        return normalized


ProjectPhaseKey = Annotated[
    str,
    Field(pattern=r"^(discover|plan|deliver|close|custom_[0-9a-f]{32})$", max_length=48),
]
ProjectPhaseColor = Literal["sky", "indigo", "emerald", "amber"]


def _validate_phase_collection(
    items: list["WorkspaceProjectPhaseDefinitionStored"],
) -> list["WorkspaceProjectPhaseDefinitionStored"]:
    keys = [item.key for item in items]
    if len(keys) != len(set(keys)):
        raise ValueError("phase keys must be unique")
    if not set(PROJECT_PHASE_KEYS).issubset(keys):
        raise ValueError("items must contain every built-in phase key")
    if any(item.retired for item in items if item.key in PROJECT_PHASE_KEYS):
        raise ValueError("built-in phases cannot be retired")
    retired_seen = False
    for item in items:
        if item.retired:
            retired_seen = True
        elif retired_seen:
            raise ValueError("active phases must appear before retired phases")
    if len({item.name.casefold() for item in items}) != len(items):
        raise ValueError("phase names must be unique ignoring case")
    if sum(not item.retired for item in items) > MAX_ACTIVE_PROJECT_PHASES:
        raise ValueError(f"active phases cannot exceed {MAX_ACTIVE_PROJECT_PHASES}")
    return items


class WorkspaceProjectPhaseDefinitionStored(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: ProjectPhaseKey
    name: str
    color: ProjectPhaseColor
    retired: bool = False

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 40:
            raise ValueError("name must be 1-40 chars after trim")
        return value


class WorkspaceProjectPhaseDefinitionsStored(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[WorkspaceProjectPhaseDefinitionStored] = Field(
        min_length=len(PROJECT_PHASE_KEYS),
        max_length=MAX_PROJECT_PHASE_DEFINITIONS,
    )

    @field_validator("items")
    @classmethod
    def _items(
        cls, value: list[WorkspaceProjectPhaseDefinitionStored]
    ) -> list[WorkspaceProjectPhaseDefinitionStored]:
        return _validate_phase_collection(value)


class WorkspaceProjectPhaseDefinitionRead(BaseModel):
    key: ProjectPhaseKey
    name: str
    color: ProjectPhaseColor
    position: int
    retired: bool
    built_in: bool


class WorkspaceProjectPhaseDefinitionsRead(BaseModel):
    items: list[WorkspaceProjectPhaseDefinitionRead]
    revision: int
    updated_by_user_id: uuid.UUID | None
    updated_by_name: str | None
    updated_at: datetime


class WorkspaceProjectPhaseDefinitionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: ProjectPhaseKey
    name: str
    color: ProjectPhaseColor

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 40:
            raise ValueError("name must be 1-40 chars after trim")
        return value


class WorkspaceProjectPhaseDefinitionsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[WorkspaceProjectPhaseDefinitionUpdate] = Field(
        min_length=len(PROJECT_PHASE_KEYS),
        max_length=MAX_PROJECT_PHASE_DEFINITIONS,
    )

    @model_validator(mode="after")
    def _items(self) -> "WorkspaceProjectPhaseDefinitionsUpdate":
        keys = [item.key for item in self.items]
        if len(keys) != len(set(keys)):
            raise ValueError("phase keys must be unique")
        if not set(PROJECT_PHASE_KEYS).issubset(keys):
            raise ValueError("items must contain every built-in phase key")
        if len({item.name.casefold() for item in self.items}) != len(self.items):
            raise ValueError("phase names must be unique ignoring case")
        return self


class WorkspaceProjectPhaseDefinitionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    color: ProjectPhaseColor

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 40:
            raise ValueError("name must be 1-40 chars after trim")
        return value
