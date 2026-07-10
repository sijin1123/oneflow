import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.models.automation_rule import ACTION_TYPES, CONDITION_FIELDS, TRIGGER_TYPES
from app.models.custom_field import CUSTOM_FIELD_TYPES
from app.models.work_package import WP_PRIORITIES, WP_STATUSES, WP_TYPES

SNAPSHOT_VERSION = 1
MAX_TEMPLATE_CUSTOM_FIELDS = 100
MAX_TEMPLATE_AUTOMATION_RULES = 100
MAX_CUSTOM_FIELD_OPTIONS = 50


def _trimmed(value: str, *, field: str, maximum: int) -> str:
    value = value.strip()
    if not 1 <= len(value) <= maximum:
        raise ValueError(f"{field} must be 1-{maximum} chars after trim")
    return value


def _position(value: int) -> int:
    if not 0 <= value <= 999:
        raise ValueError("position must be between 0 and 999")
    return value


class TemplateStatusSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    name: str
    position: int

    @field_validator("key")
    @classmethod
    def _key(cls, value: str) -> str:
        if value not in WP_STATUSES:
            raise ValueError(f"key must be one of {WP_STATUSES}")
        return value

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _trimmed(value, field="name", maximum=40)

    @field_validator("position")
    @classmethod
    def _valid_position(cls, value: int) -> int:
        return _position(value)


class TemplateTypeSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    name: str
    position: int
    is_active: bool

    @field_validator("key")
    @classmethod
    def _key(cls, value: str) -> str:
        if value not in WP_TYPES:
            raise ValueError(f"key must be one of {WP_TYPES}")
        return value

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _trimmed(value, field="name", maximum=40)

    @field_validator("position")
    @classmethod
    def _valid_position(cls, value: int) -> int:
        return _position(value)


class TemplateCustomFieldSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    field_type: str
    options: list[str] | None = None
    position: int
    is_active: bool
    applies_to: list[str] | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _trimmed(value, field="name", maximum=80)

    @field_validator("field_type")
    @classmethod
    def _field_type(cls, value: str) -> str:
        if value not in CUSTOM_FIELD_TYPES:
            raise ValueError(f"field_type must be one of {CUSTOM_FIELD_TYPES}")
        return value

    @field_validator("options")
    @classmethod
    def _options(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = [_trimmed(option, field="option", maximum=80) for option in value]
        if not 1 <= len(cleaned) <= MAX_CUSTOM_FIELD_OPTIONS:
            raise ValueError(f"options must contain 1-{MAX_CUSTOM_FIELD_OPTIONS} values")
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("options must be unique")
        return cleaned

    @field_validator("position")
    @classmethod
    def _valid_position(cls, value: int) -> int:
        return _position(value)

    @field_validator("applies_to")
    @classmethod
    def _applies_to(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        if not value:
            raise ValueError("applies_to must be null or a non-empty list")
        if len(value) != len(set(value)) or any(item not in WP_TYPES for item in value):
            raise ValueError(f"applies_to must be unique entries from {WP_TYPES}")
        return value

    @model_validator(mode="after")
    def _options_match_type(self) -> "TemplateCustomFieldSnapshot":
        if self.field_type == "dropdown" and self.options is None:
            raise ValueError("dropdown fields require options")
        if self.field_type != "dropdown" and self.options is not None:
            raise ValueError("options are only allowed for dropdown fields")
        return self


class TemplateAutomationRuleSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    trigger_type: str
    trigger_value: str
    action_type: str
    action_value: str
    condition_field: str | None = None
    condition_value: str | None = None
    position: int

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _trimmed(value, field="name", maximum=80)

    @field_validator("trigger_type")
    @classmethod
    def _trigger_type(cls, value: str) -> str:
        if value not in TRIGGER_TYPES:
            raise ValueError(f"trigger_type must be one of {TRIGGER_TYPES}")
        return value

    @field_validator("action_type")
    @classmethod
    def _action_type(cls, value: str) -> str:
        if value not in ACTION_TYPES:
            raise ValueError(f"action_type must be one of {ACTION_TYPES}")
        return value

    @field_validator("position")
    @classmethod
    def _valid_position(cls, value: int) -> int:
        return _position(value)

    @model_validator(mode="after")
    def _rule_values(self) -> "TemplateAutomationRuleSnapshot":
        trigger_vocab = {
            "status_changed_to": WP_STATUSES,
            "type_changed_to": WP_TYPES,
            "priority_changed_to": WP_PRIORITIES,
        }[self.trigger_type]
        if self.trigger_value not in trigger_vocab:
            raise ValueError(f"trigger_value must be one of {trigger_vocab}")
        if self.action_type == "set_priority" and self.action_value not in WP_PRIORITIES:
            raise ValueError(f"action_value must be one of {WP_PRIORITIES}")
        if self.action_type == "set_assignee":
            try:
                self.action_value = str(uuid.UUID(self.action_value))
            except ValueError as exc:
                raise ValueError("action_value must be a user id") from exc
        if (self.condition_field is None) != (self.condition_value is None):
            raise ValueError("condition_field and condition_value must be set together")
        if self.condition_field is not None:
            if self.condition_field not in CONDITION_FIELDS:
                raise ValueError(f"condition_field must be one of {CONDITION_FIELDS}")
            condition_vocab = {
                "status": WP_STATUSES,
                "type": WP_TYPES,
                "priority": WP_PRIORITIES,
            }[self.condition_field]
            if self.condition_value not in condition_vocab:
                raise ValueError(f"condition_value must be one of {condition_vocab}")
        return self


class ProjectTemplateSnapshot(BaseModel):
    """Explicit versioned configuration; unknown/member/content/secret keys fail."""

    model_config = ConfigDict(extra="forbid")

    schema_version: int
    statuses: list[TemplateStatusSnapshot]
    types: list[TemplateTypeSnapshot]
    custom_fields: list[TemplateCustomFieldSnapshot]
    automation_rules: list[TemplateAutomationRuleSnapshot]

    @field_validator("schema_version")
    @classmethod
    def _schema_version(cls, value: int) -> int:
        if value != SNAPSHOT_VERSION:
            raise ValueError(f"schema_version must be {SNAPSHOT_VERSION}")
        return value

    @model_validator(mode="after")
    def _collections(self) -> "ProjectTemplateSnapshot":
        if len(self.statuses) > len(WP_STATUSES) or len(
            {item.key for item in self.statuses}
        ) != len(self.statuses):
            raise ValueError("statuses must use unique supported keys")
        if len(self.types) > len(WP_TYPES) or len({item.key for item in self.types}) != len(
            self.types
        ):
            raise ValueError("types must use unique supported keys")
        if len(self.custom_fields) > MAX_TEMPLATE_CUSTOM_FIELDS:
            raise ValueError(
                f"custom_fields must contain at most {MAX_TEMPLATE_CUSTOM_FIELDS} entries"
            )
        if len({item.name for item in self.custom_fields}) != len(self.custom_fields):
            raise ValueError("custom_fields names must be unique")
        if len(self.automation_rules) > MAX_TEMPLATE_AUTOMATION_RULES:
            raise ValueError(
                f"automation_rules must contain at most {MAX_TEMPLATE_AUTOMATION_RULES} entries"
            )
        return self


class TemplateApplied(BaseModel):
    statuses: int
    types: int
    custom_fields: int
    automation_rules: int


class ProjectTemplateRevisionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    template_id: uuid.UUID
    version: int
    snapshot: ProjectTemplateSnapshot
    created_by: uuid.UUID | None
    created_at: datetime


class ProjectTemplateCreate(BaseModel):
    name: str
    description: str | None = None
    source_project_id: uuid.UUID

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _trimmed(value, field="name", maximum=120)

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        if value is not None and len(value) > 20_000:
            raise ValueError("description exceeds 20000 chars")
        return value


class ProjectTemplateRevisionCreate(BaseModel):
    source_project_id: uuid.UUID | None = None


class ProjectTemplateApply(BaseModel):
    name: str
    key: str
    description: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _trimmed(value, field="name", maximum=120)

    @field_validator("key")
    @classmethod
    def _key(cls, value: str) -> str:
        if not re.match(r"^[A-Z][A-Z0-9]{1,9}$", value):
            raise ValueError("key must match ^[A-Z][A-Z0-9]{1,9}$")
        return value

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        if value is not None and len(value) > 20_000:
            raise ValueError("description exceeds 20000 chars")
        return value


class ProjectTemplateSummary(BaseModel):
    version: int
    statuses: int
    types: int
    custom_fields: int
    automation_rules: int


class ProjectTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    source_project_id: uuid.UUID | None
    source_project_name: str | None = None
    created_by: uuid.UUID | None
    creator_name: str | None = None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    latest_revision: ProjectTemplateSummary | None = None
    can_manage: bool = False


class ProjectTemplateList(BaseModel):
    items: list[ProjectTemplateRead]
    total: int
    limit: int
    offset: int


class ProjectTemplateSourceRead(BaseModel):
    id: uuid.UUID
    key: str
    name: str


class ProjectTemplateSourceList(BaseModel):
    items: list[ProjectTemplateSourceRead]
    total: int
