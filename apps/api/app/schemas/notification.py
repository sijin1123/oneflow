import uuid
from datetime import datetime

from pydantic import BaseModel


class NotificationRead(BaseModel):
    id: uuid.UUID
    kind: str
    project_id: uuid.UUID | None
    initiative_id: uuid.UUID | None = None
    work_package_id: uuid.UUID | None
    # WP-less intake notifications anchor to their item instead (Pass 49).
    intake_item_id: uuid.UUID | None = None
    # Joined for display so the client need not fetch each work package.
    work_package_subject: str | None
    initiative_name: str | None = None
    actor_name: str | None
    read: bool
    created_at: datetime


class NotificationList(BaseModel):
    items: list[NotificationRead]
    total: int
    # Always the true unread total, independent of the unread_only filter.
    unread: int
