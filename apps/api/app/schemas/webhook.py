import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

WEBHOOK_EVENTS = ("work_package.created", "work_package.updated")


def _name(value: str) -> str:
    value = value.strip()
    if not 1 <= len(value) <= 80:
        raise ValueError("name must be 1-80 chars after trim")
    return value


def _events(value: list[str]) -> list[str]:
    normalized = list(dict.fromkeys(value))
    if not normalized or any(event not in WEBHOOK_EVENTS for event in normalized):
        raise ValueError(f"event_types must contain only {WEBHOOK_EVENTS}")
    return normalized


class WebhookEndpointRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    url: str
    event_types: list[str]
    is_active: bool
    secret_version: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class WebhookEndpointList(BaseModel):
    items: list[WebhookEndpointRead]
    total: int
    enabled: bool


class WebhookEndpointCreate(BaseModel):
    name: str
    url: str = Field(max_length=2048)
    event_types: list[str]

    _validate_name = field_validator("name")(_name)
    _validate_events = field_validator("event_types")(_events)


class WebhookEndpointUpdate(BaseModel):
    name: str | None = None
    url: str | None = Field(default=None, max_length=2048)
    event_types: list[str] | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("name cannot be null")
        return _name(value)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("url cannot be null")
        return value

    @field_validator("event_types")
    @classmethod
    def validate_events(cls, value: list[str] | None) -> list[str]:
        if value is None:
            raise ValueError("event_types cannot be null")
        return _events(value)

    @field_validator("is_active")
    @classmethod
    def validate_active(cls, value: bool | None) -> bool:
        if value is None:
            raise ValueError("is_active cannot be null")
        return value


class WebhookEndpointCreated(BaseModel):
    item: WebhookEndpointRead
    secret: str


class WebhookDeliveryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    endpoint_id: uuid.UUID
    event_type: str
    status: str
    attempt_count: int
    response_status: int | None
    duration_ms: int | None
    error: str | None
    created_at: datetime
    attempted_at: datetime | None


class WebhookDeliveryList(BaseModel):
    items: list[WebhookDeliveryRead]
    total: int
