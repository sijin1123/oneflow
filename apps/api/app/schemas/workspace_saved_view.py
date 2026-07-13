import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_INT4 = 2_147_483_647


class WorkspaceSavedViewParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    q: str = Field(default="", max_length=120)
    scope: Literal["all", "assigned", "created", "subscribed"] = "all"
    state: Literal["all", "open"] = "all"
    sort: Literal["updated", "due"] = "updated"
    priority: Literal["all", "none", "low", "medium", "high", "urgent"] = "all"
    layout: Literal["board", "calendar", "table", "timeline"] = "board"
    density: Literal["comfortable", "compact"] = "comfortable"
    group_by: Literal["state", "priority", "project", "assignee", "none"] = "state"
    columns: list[
        Literal["project", "status", "priority", "type", "assignee", "start", "due", "updated"]
    ] = Field(
        default_factory=lambda: [
            "project",
            "status",
            "priority",
            "type",
            "assignee",
            "start",
            "due",
            "updated",
        ],
        min_length=1,
    )
    show_empty_groups: bool = True
    show_ids: bool = False
    filter_mode: Literal["basic", "pql"] = "basic"
    pql: str = Field(default="", max_length=1000)

    @field_validator("q")
    @classmethod
    def _clean_query(cls, value: str) -> str:
        return value.strip()

    @field_validator("pql")
    @classmethod
    def _clean_pql(cls, value: str) -> str:
        return value.strip()

    @field_validator("columns")
    @classmethod
    def _require_unique_columns(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("columns must not contain duplicates")
        order = {
            key: index
            for index, key in enumerate(
                ("project", "status", "priority", "type", "assignee", "start", "due", "updated")
            )
        }
        return sorted(value, key=order.__getitem__)

    @model_validator(mode="after")
    def _validate_filter_mode(self) -> "WorkspaceSavedViewParams":
        if self.filter_mode == "pql":
            from app.services.workspace_pql import PqlError, parse_pql

            if not self.pql:
                raise ValueError("pql is required when filter_mode is pql")
            try:
                self.pql = parse_pql(self.pql).normalized
            except PqlError as exc:
                raise ValueError(str(exc)) from exc
            self.state = "all"
            self.sort = "updated"
            self.priority = "all"
        else:
            self.pql = ""
        return self


def _clean_name(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("name cannot be blank")
    return value


class WorkspaceSavedViewCreate(BaseModel):
    name: str = Field(max_length=120)
    params: WorkspaceSavedViewParams = WorkspaceSavedViewParams()

    _name = field_validator("name")(_clean_name)


class WorkspaceSavedViewUpdate(BaseModel):
    expected_version: int = Field(ge=0, le=MAX_INT4)
    name: str | None = Field(default=None, max_length=120)
    params: WorkspaceSavedViewParams | None = None

    @field_validator("name")
    @classmethod
    def _optional_name(cls, value: str | None) -> str | None:
        return None if value is None else _clean_name(value)

    @model_validator(mode="after")
    def _has_change(self) -> "WorkspaceSavedViewUpdate":
        fields = self.model_fields_set - {"expected_version"}
        if not fields:
            raise ValueError("at least one editable field is required")
        for field in fields:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class WorkspaceSavedViewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    params: WorkspaceSavedViewParams
    version: int
    created_at: datetime
    updated_at: datetime


class WorkspaceSavedViewList(BaseModel):
    items: list[WorkspaceSavedViewRead]
    total: int


class WorkspaceSavedViewError(BaseModel):
    detail: str


class WorkspaceSavedViewConflict(BaseModel):
    detail: str = "workspace view was changed elsewhere"
    current: WorkspaceSavedViewRead
