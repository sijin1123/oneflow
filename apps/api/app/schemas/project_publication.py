import uuid
from datetime import datetime

from pydantic import BaseModel


class ProjectPublicationRead(BaseModel):
    published: bool
    public_id: uuid.UUID | None
    published_at: datetime | None
    revoked_at: datetime | None
    revision: int


class PublicProjectRead(BaseModel):
    public_id: uuid.UUID
    name: str
    description: str | None
    published_at: datetime
    work_package_count: int
    open_work_package_count: int
    completed_work_package_count: int
    completion_percent: int
