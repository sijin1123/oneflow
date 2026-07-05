import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

MAX_COMMENT = 20_000


class CommentCreate(BaseModel):
    body: str

    @field_validator("body")
    @classmethod
    def _body(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= MAX_COMMENT:
            raise ValueError(f"comment body must be 1-{MAX_COMMENT} chars after trim")
        return v


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    work_package_id: uuid.UUID
    author_id: uuid.UUID | None
    body: str
    created_at: datetime
    updated_at: datetime


class CommentList(BaseModel):
    items: list[CommentRead]
    total: int


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    work_package_id: uuid.UUID
    actor_id: uuid.UUID | None
    action: str
    field: str | None
    old_value: str | None
    new_value: str | None
    created_at: datetime


class ActivityList(BaseModel):
    items: list[ActivityRead]
    total: int
