import uuid
from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, field_validator


class AttachmentCreate(BaseModel):
    filename: str
    url: str
    content_type: str | None = None
    size_bytes: int | None = None
    # Optional anchor (at most one) — validated against the project in the router.
    work_package_id: uuid.UUID | None = None
    document_id: uuid.UUID | None = None

    @field_validator("filename")
    @classmethod
    def _filename(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 255:
            raise ValueError("filename must be 1-255 chars after trim")
        return v

    @field_validator("url")
    @classmethod
    def _url(cls, v: str) -> str:
        v = v.strip()
        parts = urlsplit(v)
        # Only http(s) references — no javascript:/data:/file: links.
        if parts.scheme not in {"http", "https"} or not parts.netloc:
            raise ValueError("url must be a valid http(s) URL")
        if len(v) > 2000:
            raise ValueError("url must be <= 2000 chars")
        return v

    @field_validator("content_type")
    @classmethod
    def _ct(cls, v: str | None) -> str | None:
        if v is not None and len(v) > 120:
            raise ValueError("content_type must be <= 120 chars")
        return v

    @field_validator("size_bytes")
    @classmethod
    def _size(cls, v: int | None) -> int | None:
        if v is not None and not 0 <= v <= 1_099_511_627_776:  # 0 .. 1 TiB
            raise ValueError("size_bytes must be between 0 and 1 TiB")
        return v


class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    work_package_id: uuid.UUID | None = None
    document_id: uuid.UUID | None = None
    filename: str
    content_type: str | None
    size_bytes: int | None
    url: str
    # True for uploaded rows — the client renders a /download link instead of
    # the sentinel url (URL-only rows keep the external link).
    has_file: bool = False
    search_index_status: Literal[
        "not_applicable",
        "pending",
        "indexed",
        "unsupported",
        "too_large",
        "invalid_text",
        "missing_blob",
    ]
    search_indexed_at: datetime | None
    uploaded_by: uuid.UUID | None
    created_at: datetime


class AttachmentList(BaseModel):
    items: list[AttachmentRead]
    total: int


class AttachmentDirectoryItem(AttachmentRead):
    work_package_subject: str | None = None
    document_title: str | None = None


class AttachmentDirectorySummary(BaseModel):
    total: int
    file_count: int
    link_count: int
    linked_count: int
    indexed_file_count: int
    pending_index_count: int
    used_bytes: int


class AttachmentDirectoryList(BaseModel):
    items: list[AttachmentDirectoryItem]
    total: int
    summary: AttachmentDirectorySummary
    next_cursor_created_at: datetime | None = None
    next_cursor_id: uuid.UUID | None = None
    highlight_item: AttachmentDirectoryItem | None = None


class StorageRead(BaseModel):
    """Settings Storage tab payload (Pass 57): used counts stored blobs only;
    links carry no bytes. quota comes from env (read-only here)."""

    used_bytes: int
    quota_bytes: int
    attachment_count: int
    link_count: int


class AttachmentSearchReindexResult(BaseModel):
    processed: int
    indexed: int
    remaining: int
    statuses: dict[str, int]
