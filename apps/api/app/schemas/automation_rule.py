import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.models.automation_rule import ACTION_TYPES, TRIGGER_TYPES
from app.models.work_package import WP_PRIORITIES, WP_STATUSES


class AutomationRuleCreate(BaseModel):
    name: str
    trigger_type: str = "status_changed_to"
    trigger_value: str
    action_type: str = "set_priority"
    action_value: str
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 80:
            raise ValueError("name must be 1-80 chars after trim")
        return v

    @field_validator("trigger_type")
    @classmethod
    def _tt(cls, v: str) -> str:
        if v not in TRIGGER_TYPES:
            raise ValueError(f"trigger_type must be one of {TRIGGER_TYPES}")
        return v

    @field_validator("action_type")
    @classmethod
    def _at(cls, v: str) -> str:
        if v not in ACTION_TYPES:
            raise ValueError(f"action_type must be one of {ACTION_TYPES}")
        return v

    @model_validator(mode="after")
    def _values(self) -> "AutomationRuleCreate":
        # Validate each value against the vocabulary its type implies.
        if self.trigger_type == "status_changed_to" and self.trigger_value not in WP_STATUSES:
            raise ValueError(f"trigger_value must be one of {WP_STATUSES}")
        if self.action_type == "set_priority" and self.action_value not in WP_PRIORITIES:
            raise ValueError(f"action_value must be one of {WP_PRIORITIES}")
        return self


class AutomationRuleUpdate(BaseModel):
    """Partial rule edit (v13.1) — omitted fields keep their current value.
    Validation runs on the MERGED rule (router builds an AutomationRuleCreate
    from current+patch), so a value change can never leave the pair invalid."""

    name: str | None = None
    trigger_value: str | None = None
    action_value: str | None = None
    is_active: bool | None = None


class AutomationRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    trigger_type: str
    trigger_value: str
    action_type: str
    action_value: str
    is_active: bool
    last_fired_at: datetime | None
    fired_count: int
    created_at: datetime


class AutomationRuleList(BaseModel):
    items: list[AutomationRuleRead]
    total: int


class AutomationRuleRunRead(BaseModel):
    """Execution-log row (v16.1 R1-⑤). Deleted references read via snapshots:
    rule_id/work_package_id/actor_id may be null while rule_name and
    work_package_subject stay readable."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rule_id: uuid.UUID | None
    rule_name: str
    work_package_id: uuid.UUID | None
    work_package_subject: str
    field: str
    old_value: str | None
    new_value: str | None
    actor_id: uuid.UUID | None
    created_at: datetime


class AutomationRuleRunList(BaseModel):
    items: list[AutomationRuleRunRead]
    total: int
