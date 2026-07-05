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
    is_active: bool


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
    created_at: datetime


class AutomationRuleList(BaseModel):
    items: list[AutomationRuleRead]
    total: int
