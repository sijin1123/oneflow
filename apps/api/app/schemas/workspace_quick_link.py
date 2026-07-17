import uuid
from datetime import datetime
from urllib.parse import urlsplit, urlunsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_INT4 = 2_147_483_647


def _title(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("title cannot be blank")
    return cleaned


def _destination(value: str) -> str:
    cleaned = value.strip()
    if not cleaned or any(ord(char) < 32 for char in cleaned):
        raise ValueError("destination is invalid")
    if cleaned.startswith("/"):
        if cleaned.startswith("//") or "\\" in cleaned:
            raise ValueError("internal destination must be a canonical path")
        parsed = urlsplit(cleaned)
        if parsed.scheme or parsed.netloc:
            raise ValueError("internal destination must be a canonical path")
        return urlunsplit(("", "", parsed.path, parsed.query, parsed.fragment))

    parsed = urlsplit(cleaned)
    if (
        parsed.scheme.lower() != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError("external destination must be a credential-free HTTPS URL")
    try:
        _ = parsed.port
    except ValueError as exc:
        raise ValueError("destination port is invalid") from exc
    return urlunsplit(("https", parsed.netloc, parsed.path or "/", parsed.query, parsed.fragment))


class WorkspaceQuickLinkCreate(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    destination: str = Field(min_length=1, max_length=2048)

    _clean_title = field_validator("title")(_title)
    _clean_destination = field_validator("destination")(_destination)


class WorkspaceQuickLinkUpdate(BaseModel):
    expected_version: int = Field(ge=0, le=MAX_INT4)
    title: str | None = Field(default=None, min_length=1, max_length=80)
    destination: str | None = Field(default=None, min_length=1, max_length=2048)

    @field_validator("title")
    @classmethod
    def _clean_optional_title(cls, value: str | None) -> str | None:
        return None if value is None else _title(value)

    @field_validator("destination")
    @classmethod
    def _clean_optional_destination(cls, value: str | None) -> str | None:
        return None if value is None else _destination(value)

    @model_validator(mode="after")
    def _has_change(self) -> "WorkspaceQuickLinkUpdate":
        fields = self.model_fields_set - {"expected_version"}
        if not fields:
            raise ValueError("at least one editable field is required")
        for field in fields:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class WorkspaceQuickLinkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    destination: str
    position: int
    version: int
    created_at: datetime
    updated_at: datetime


class WorkspaceQuickLinkList(BaseModel):
    items: list[WorkspaceQuickLinkRead]
    total: int


class WorkspaceQuickLinkOrderItem(BaseModel):
    id: uuid.UUID
    expected_version: int = Field(ge=0, le=MAX_INT4)


class WorkspaceQuickLinkOrder(BaseModel):
    items: list[WorkspaceQuickLinkOrderItem] = Field(max_length=8)


class WorkspaceQuickLinkError(BaseModel):
    detail: str


class WorkspaceQuickLinkConflict(BaseModel):
    detail: str = "quick link was changed elsewhere"
    current: WorkspaceQuickLinkRead
