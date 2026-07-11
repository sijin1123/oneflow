"""Read models for the workspace-admin worklog audit surface."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel


class AdminWorklogRead(BaseModel):
    id: uuid.UUID
    work_package_id: uuid.UUID
    work_package_subject: str
    project_id: uuid.UUID
    project_key: str
    project_name: str
    project_is_archived: bool
    user_id: uuid.UUID | None
    user_display_name: str | None
    user_email: str | None
    user_is_active: bool | None
    hours: float
    spent_on: date
    comment: str | None
    created_at: datetime


class AdminWorklogList(BaseModel):
    from_date: date
    to_date: date
    items: list[AdminWorklogRead]
    total: int
    total_hours: float
    limit: int
    offset: int


class AdminWorklogUserOption(BaseModel):
    id: uuid.UUID
    display_name: str
    email: str
    is_active: bool


class AdminWorklogProjectOption(BaseModel):
    id: uuid.UUID
    key: str
    name: str
    is_archived: bool


class AdminWorklogOptions(BaseModel):
    users: list[AdminWorklogUserOption]
    projects: list[AdminWorklogProjectOption]
