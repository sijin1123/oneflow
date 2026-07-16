import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.schemas.document import MAX_BODY, DocumentRead

MAX_COMMENT = 4000
MAX_ANCHOR_QUOTE = 500


class DocumentCommentCreate(BaseModel):
    """Plain text only (the document body is the rich surface — v43.1 R1-⑤);
    the web renders comments as text nodes, never as HTML."""

    body: str

    @field_validator("body")
    @classmethod
    def _body(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= MAX_COMMENT:
            raise ValueError(f"body must be 1-{MAX_COMMENT} chars after trim")
        return v


class DocumentCommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    project_id: uuid.UUID
    author_id: uuid.UUID | None
    body: str
    anchor_id: uuid.UUID | None
    anchor_quote: str | None
    created_at: datetime


class DocumentCommentList(BaseModel):
    items: list[DocumentCommentRead]
    total: int  # full count (limit/offset pagination — the WP-activities contract)


class InlineDocumentCommentCreate(DocumentCommentCreate):
    anchor_id: uuid.UUID
    anchor_quote: str
    expected_document_version: int | None = None
    document_body: str | None = None

    @field_validator("anchor_quote")
    @classmethod
    def _anchor_quote(cls, v: str) -> str:
        v = " ".join(v.split())
        if not 1 <= len(v) <= MAX_ANCHOR_QUOTE:
            raise ValueError(f"anchor_quote must be 1-{MAX_ANCHOR_QUOTE} chars")
        return v

    @field_validator("expected_document_version")
    @classmethod
    def _version(cls, v: int | None) -> int | None:
        if v is None:
            return None
        if not 0 <= v <= 2_147_483_647:
            raise ValueError("expected_document_version must be between 0 and 2147483647")
        return v

    @field_validator("document_body")
    @classmethod
    def _document_body(cls, v: str | None) -> str | None:
        if v is not None and len(v) > MAX_BODY:
            raise ValueError(f"document_body exceeds {MAX_BODY} chars")
        return v

    @model_validator(mode="after")
    def _body_version_pair(self):
        if (self.document_body is None) != (self.expected_document_version is None):
            raise ValueError(
                "document_body and expected_document_version must be provided together"
            )
        return self


class InlineDocumentCommentResult(BaseModel):
    comment: DocumentCommentRead
    document: DocumentRead
