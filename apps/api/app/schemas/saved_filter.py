import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

from app.models.work_package import WP_PRIORITIES, WP_STATUSES, WP_TYPES


class SavedFilterParams(BaseModel):
    """The subset of the list query a filter can capture. Enum values are validated
    so a saved filter can never carry a status the list endpoint would 422 on."""

    status: str | None = None
    priority: str | None = None
    type: str | None = None
    q: str | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, v: str | None) -> str | None:
        if v is not None and v not in WP_STATUSES:
            raise ValueError(f"status must be one of {WP_STATUSES}")
        return v

    @field_validator("priority")
    @classmethod
    def _priority(cls, v: str | None) -> str | None:
        if v is not None and v not in WP_PRIORITIES:
            raise ValueError(f"priority must be one of {WP_PRIORITIES}")
        return v

    @field_validator("type")
    @classmethod
    def _type(cls, v: str | None) -> str | None:
        if v is not None and v not in WP_TYPES:
            raise ValueError(f"type must be one of {WP_TYPES}")
        return v

    @field_validator("q")
    @classmethod
    def _q(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v:
                return None
            if len(v) > 255:
                raise ValueError("q must be <= 255 chars")
        return v


class SavedFilterCreate(BaseModel):
    name: str
    params: SavedFilterParams = SavedFilterParams()

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 80:
            raise ValueError("name must be 1-80 chars after trim")
        return v


class SavedFilterRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    params: SavedFilterParams
    created_at: datetime


class SavedFilterList(BaseModel):
    items: list[SavedFilterRead]
    total: int
