import uuid
from datetime import datetime

from pydantic import BaseModel


class DataTransferJobRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_key: str
    project_name: str
    actor_id: uuid.UUID | None
    actor_name: str
    direction: str
    source: str
    dry_run: bool
    status: str
    total_rows: int
    valid_rows: int
    invalid_rows: int
    inserted_rows: int
    checksum: str
    errors_truncated: bool
    notes: list[str]
    artifact_available: bool
    artifact_filename: str | None
    artifact_size_bytes: int | None
    artifact_sha256: str | None
    created_at: datetime


class DataTransferJobList(BaseModel):
    items: list[DataTransferJobRead]
    total: int
    limit: int
    offset: int


class DataTransferExportCreated(BaseModel):
    job_id: uuid.UUID
    row_count: int
    checksum: str
    artifact_sha256: str
    artifact_filename: str
    artifact_size_bytes: int
