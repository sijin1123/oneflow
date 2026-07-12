import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_INT4 = 2_147_483_647
PersonalNoteColor = Literal["lavender", "mint", "yellow", "rose", "blue", "gray"]


def _title(value: str) -> str:
    return value.strip()


class PersonalNoteCreate(BaseModel):
    title: str = Field(default="", max_length=120)
    body: str = Field(default="", max_length=4000)
    color: PersonalNoteColor = "lavender"
    is_pinned: bool = False

    _clean_title = field_validator("title")(_title)


class PersonalNoteUpdate(BaseModel):
    expected_version: int = Field(ge=0, le=MAX_INT4)
    title: str | None = Field(default=None, max_length=120)
    body: str | None = Field(default=None, max_length=4000)
    color: PersonalNoteColor | None = None
    is_pinned: bool | None = None

    @field_validator("title")
    @classmethod
    def _clean_optional_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _title(value)

    @model_validator(mode="after")
    def _has_change(self) -> "PersonalNoteUpdate":
        fields = self.model_fields_set - {"expected_version"}
        if not fields:
            raise ValueError("at least one editable field is required")
        for field in fields:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class PersonalNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    body: str
    color: PersonalNoteColor
    is_pinned: bool
    position: int
    version: int
    created_at: datetime
    updated_at: datetime


class PersonalNoteList(BaseModel):
    items: list[PersonalNoteRead]
    total: int
    limit: int
    offset: int


class PersonalNoteOrderItem(BaseModel):
    id: uuid.UUID
    expected_version: int = Field(ge=0, le=MAX_INT4)


class PersonalNoteOrder(BaseModel):
    """Full replacement. Pinned entries must form the leading contiguous group."""

    items: list[PersonalNoteOrderItem] = Field(max_length=200)


class PersonalNoteError(BaseModel):
    detail: str


class PersonalNoteConflict(BaseModel):
    detail: str = "note was changed elsewhere"
    current: PersonalNoteRead
