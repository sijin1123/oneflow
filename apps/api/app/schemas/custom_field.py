import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator, model_validator

from app.models.custom_field import CUSTOM_FIELD_TYPES
from app.models.work_package import WP_TYPES

MAX_OPTIONS = 50


def _clean_applies_to(v: list[str] | None) -> list[str] | None:
    if v is None:
        return None
    if not v:
        # Explicitly rejected: [] would silently mean "no type" — use null for
        # "all types" and a non-empty subset otherwise (validator R1 ④).
        raise ValueError("applies_to must be null (all types) or a non-empty list")
    cleaned = list(dict.fromkeys(v))  # de-dupe, keep order
    for key in cleaned:
        if key not in WP_TYPES:
            raise ValueError(f"applies_to entries must be one of {WP_TYPES}")
    return cleaned


def _clean_name(v: str) -> str:
    v = v.strip()
    if not 1 <= len(v) <= 80:
        raise ValueError("name must be 1-80 chars after trim")
    return v


def _clean_options(options: list | None) -> list[str] | None:
    if options is None:
        return None
    cleaned: list[str] = []
    for opt in options:
        if not isinstance(opt, str) or not opt.strip():
            raise ValueError("options must be non-empty strings")
        cleaned.append(opt.strip())
    if not 1 <= len(cleaned) <= MAX_OPTIONS:
        raise ValueError(f"options must have 1-{MAX_OPTIONS} entries")
    if len(set(cleaned)) != len(cleaned):
        raise ValueError("options must be unique")
    return cleaned


class CustomFieldCreate(BaseModel):
    name: str
    field_type: str
    options: list[str] | None = None
    applies_to: list[str] | None = None

    @field_validator("applies_to")
    @classmethod
    def _applies(cls, v: list[str] | None) -> list[str] | None:
        return _clean_applies_to(v)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _clean_name(v)

    @field_validator("field_type")
    @classmethod
    def _type(cls, v: str) -> str:
        if v not in CUSTOM_FIELD_TYPES:
            raise ValueError(f"field_type must be one of {CUSTOM_FIELD_TYPES}")
        return v

    @model_validator(mode="after")
    def _options_by_type(self) -> "CustomFieldCreate":
        if self.field_type == "dropdown":
            self.options = _clean_options(self.options)
            if self.options is None:
                raise ValueError("dropdown fields require options")
        elif self.options is not None:
            raise ValueError("options are only allowed for dropdown fields")
        return self


class CustomFieldUpdate(BaseModel):
    """field_type is immutable — changing it would corrupt stored values.
    applies_to CAN be updated; send null to widen back to all types."""

    name: str | None = None
    options: list[str] | None = None
    is_active: bool | None = None
    applies_to: list[str] | None = None

    @field_validator("applies_to")
    @classmethod
    def _applies(cls, v: list[str] | None) -> list[str] | None:
        return _clean_applies_to(v)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return None if v is None else _clean_name(v)

    @field_validator("options")
    @classmethod
    def _options(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _clean_options(v)


class CustomFieldRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    field_type: str
    options: list[str] | None
    position: int
    is_active: bool
    applies_to: list[str] | None
    created_at: datetime
    updated_at: datetime


class CustomFieldList(BaseModel):
    items: list[CustomFieldRead]
    total: int


class CustomValueWrite(BaseModel):
    field_id: uuid.UUID
    # None deletes the stored value; anything else is validated by field_type.
    value: Any = None


class CustomValuesPut(BaseModel):
    """DELTA semantics: only the listed field_ids are touched — other stored
    values are never overwritten by a stale full-state payload."""

    values: list[CustomValueWrite]


class CustomValueRead(BaseModel):
    field_id: uuid.UUID
    value: Any
    # member fields resolve the display name at read time ("(삭제된 사용자)" if gone).
    member_display_name: str | None = None


class CustomValueList(BaseModel):
    items: list[CustomValueRead]
    total: int
