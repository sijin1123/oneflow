import uuid
from datetime import date, datetime

from pydantic import BaseModel


class MyWorkPackage(BaseModel):
    """Slim cross-project work-package row for the personal home: enough to
    render a list line and deep-link into the owning project's views."""

    id: uuid.UUID
    project_id: uuid.UUID
    project_name: str
    subject: str
    type: str
    status: str
    priority: str
    due_date: date | None
    # Server-enriched (cross-project screen — the web can't resolve rosters;
    # the MyActivityRead actor_name precedent). Null id = unassigned.
    assignee_id: uuid.UUID | None = None
    assignee_name: str | None = None


class MyActivityRead(BaseModel):
    """Recent activity across the caller's projects, enriched for display."""

    id: uuid.UUID
    project_id: uuid.UUID
    project_name: str
    work_package_id: uuid.UUID
    work_package_subject: str
    actor_name: str | None
    action: str
    field: str | None
    old_value: str | None
    new_value: str | None
    created_at: datetime


class MeWorkRead(BaseModel):
    """Personal home payload. Lists are hard-capped (no pagination yet):
    assigned/due-soon/created at 50, activity at 20 — documented in the
    coverage ledger."""

    assigned_to_me: list[MyWorkPackage]
    due_soon: list[MyWorkPackage]
    # Delegation view (Pass 45): open items I created that are NOT mine to do
    # (unassigned or assigned to someone else).
    created_by_me: list[MyWorkPackage]
    recent_activity: list[MyActivityRead]
