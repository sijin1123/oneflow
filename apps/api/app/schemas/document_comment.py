import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

MAX_COMMENT = 4000


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
    created_at: datetime


class DocumentCommentList(BaseModel):
    items: list[DocumentCommentRead]
    total: int  # full count (limit/offset pagination — the WP-activities contract)
