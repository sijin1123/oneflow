import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

MAX_BODY = 100_000


def _title(v: str) -> str:
    v = v.strip()
    if not 1 <= len(v) <= 200:
        raise ValueError("title must be 1-200 chars after trim")
    return v


def _body(v: str | None) -> str | None:
    if v is not None and len(v) > MAX_BODY:
        raise ValueError(f"body exceeds {MAX_BODY} chars")
    return v


class DocumentCreate(BaseModel):
    title: str
    body: str | None = None
    parent_id: uuid.UUID | None = None
    visibility: Literal["shared", "private"] = "shared"

    @field_validator("title")
    @classmethod
    def _vt(cls, v: str) -> str:
        return _title(v)

    @field_validator("body")
    @classmethod
    def _vb(cls, v: str | None) -> str | None:
        return _body(v)


class DocumentUpdate(BaseModel):
    """`parent_id` is tri-state: omitted = keep, null = move to root, uuid = reparent
    (same model_fields_set convention as title/body)."""

    expected_version: int
    title: str | None = None
    body: str | None = None
    parent_id: uuid.UUID | None = None
    visibility: Literal["shared", "private"] | None = None

    @field_validator("expected_version")
    @classmethod
    def _version(cls, v: int) -> int:
        if not 0 <= v <= 2_147_483_647:
            raise ValueError("expected_version must be between 0 and 2147483647")
        return v

    @field_validator("title")
    @classmethod
    def _title(cls, v: str | None) -> str | None:
        return None if v is None else _title(v)

    @field_validator("body")
    @classmethod
    def _body(cls, v: str | None) -> str | None:
        return _body(v)


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    parent_id: uuid.UUID | None
    title: str
    body: str | None
    author_id: uuid.UUID | None
    visibility: Literal["shared", "private"]
    archived_at: datetime | None
    archived_by_user_id: uuid.UUID | None
    archived_by_name: str | None
    version: int
    created_at: datetime
    updated_at: datetime


class DocumentListItem(BaseModel):
    """List view omits the (potentially large) body."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    parent_id: uuid.UUID | None
    title: str
    author_id: uuid.UUID | None
    visibility: Literal["shared", "private"]
    archived_at: datetime | None
    archived_by_user_id: uuid.UUID | None
    archived_by_name: str | None
    version: int
    created_at: datetime
    updated_at: datetime


class DocumentList(BaseModel):
    items: list[DocumentListItem]
    total: int


DocumentActivityKind = Literal[
    "document_created",
    "document_updated",
    "document_archived",
    "document_restored",
    "document_version_restored",
]
DocumentActivityField = Literal["title", "body", "parent", "visibility", "archive_state"]


class DocumentActivityRead(BaseModel):
    id: uuid.UUID
    actor_id: uuid.UUID | None
    actor_name: str | None
    actor_profile_image_url: str | None
    kind: DocumentActivityKind
    changed_fields: list[DocumentActivityField]
    created_at: datetime


class DocumentActivityList(BaseModel):
    items: list[DocumentActivityRead]
    total: int


DocumentRevisionField = Literal["title", "body"]


class DocumentRevisionSummary(BaseModel):
    id: uuid.UUID
    document_version: int
    actor_id: uuid.UUID | None
    actor_name: str | None
    actor_profile_image_url: str | None
    title: str
    changed_fields: list[DocumentRevisionField]
    restored_from_revision_id: uuid.UUID | None
    created_at: datetime


class DocumentRevisionRead(DocumentRevisionSummary):
    body: str | None


class DocumentRevisionList(BaseModel):
    items: list[DocumentRevisionSummary]
    total: int
    current_revision_id: uuid.UUID | None


class DocumentRevisionRestoreRequest(BaseModel):
    expected_version: int

    @field_validator("expected_version")
    @classmethod
    def _version(cls, v: int) -> int:
        if not 0 <= v <= 2_147_483_647:
            raise ValueError("expected_version must be between 0 and 2147483647")
        return v


class DocumentConflict(BaseModel):
    detail: str
    current: DocumentRead


class DocumentLifecycleRequest(BaseModel):
    expected_version: int

    @field_validator("expected_version")
    @classmethod
    def _version(cls, v: int) -> int:
        if not 0 <= v <= 2_147_483_647:
            raise ValueError("expected_version must be between 0 and 2147483647")
        return v


class DocumentLinkCreate(BaseModel):
    work_package_id: uuid.UUID


class DocumentLinkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    document_id: uuid.UUID
    work_package_id: uuid.UUID
    created_at: datetime


class DocumentLinkList(BaseModel):
    items: list[DocumentLinkRead]
    total: int
