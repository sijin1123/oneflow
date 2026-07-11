import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class _CustomerFields(BaseModel):
    name: str | None = None
    description: str | None = None
    email: str | None = None
    url: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not 1 <= len(value) <= 160:
            raise ValueError("name must be 1-160 chars after trim")
        return value

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        if value is not None and len(value) > 10_000:
            raise ValueError("description must be <= 10000 chars")
        return value

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        local, separator, domain = value.rpartition("@")
        if len(value) > 320 or not separator or not local or "." not in domain:
            raise ValueError("email must be a valid email address")
        return value

    @field_validator("url")
    @classmethod
    def _url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if len(value) > 2048 or not value.startswith(("https://", "http://")):
            raise ValueError("url must be an http(s) URL")
        return value


class CustomerCreate(_CustomerFields):
    name: str


class CustomerUpdate(_CustomerFields):
    pass


class CustomerProgress(BaseModel):
    total: int = 0
    open: int = 0
    done: int = 0
    overdue: int = 0
    project_count: int = 0


class CustomerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    email: str | None
    url: str | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    progress: CustomerProgress = Field(default_factory=CustomerProgress)


class CustomerList(BaseModel):
    items: list[CustomerRead]
    total: int
