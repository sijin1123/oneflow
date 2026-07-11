import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator


class WorkspaceIdentityRead(BaseModel):
    name: str
    revision: int


class WorkspaceProfileRead(WorkspaceIdentityRead):
    id: int
    updated_by_user_id: uuid.UUID | None
    updated_by_name: str | None
    updated_at: datetime


class WorkspaceProfileUpdate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 80:
            raise ValueError("name must be 1-80 chars after trim")
        return value
