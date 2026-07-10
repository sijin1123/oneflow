import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PersonalAccessTokenRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    token_prefix: str
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    last_used_at: datetime | None


class PersonalAccessTokenList(BaseModel):
    items: list[PersonalAccessTokenRead]
    total: int


class PersonalAccessTokenCreate(BaseModel):
    name: str
    expires_in_days: int = Field(default=90, ge=1, le=365)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 80:
            raise ValueError("name must be 1-80 chars after trim")
        return v


class PersonalAccessTokenCreated(BaseModel):
    item: PersonalAccessTokenRead
    token: str
