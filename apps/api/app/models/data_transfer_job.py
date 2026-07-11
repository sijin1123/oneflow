import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DataTransferJob(Base):
    __tablename__ = "data_transfer_jobs"
    __table_args__ = (
        CheckConstraint("direction IN ('import','export')", name="direction_allowed"),
        CheckConstraint("source IN ('oneflow','jira','linear')", name="source_allowed"),
        CheckConstraint("status IN ('completed','completed_with_errors')", name="status_allowed"),
        CheckConstraint(
            "total_rows >= 0 AND valid_rows >= 0 AND invalid_rows >= 0 "
            "AND inserted_rows >= 0 AND inserted_rows <= valid_rows",
            name="counts_valid",
        ),
        CheckConstraint("char_length(checksum) = 64", name="checksum_sha256"),
        CheckConstraint("jsonb_typeof(errors) = 'array'", name="errors_array"),
        CheckConstraint("jsonb_typeof(notes) = 'array'", name="notes_array"),
        CheckConstraint(
            "(direction = 'export' AND source = 'oneflow' AND dry_run = false "
            "AND artifact_storage_key IS NOT NULL AND artifact_filename IS NOT NULL "
            "AND artifact_size_bytes IS NOT NULL AND artifact_size_bytes >= 0 "
            "AND artifact_sha256 IS NOT NULL AND char_length(artifact_sha256) = 64) OR "
            "(direction = 'import' AND artifact_storage_key IS NULL "
            "AND artifact_filename IS NULL AND artifact_size_bytes IS NULL "
            "AND artifact_sha256 IS NULL)",
            name="artifact_shape",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_name: Mapped[str] = mapped_column(String(120), nullable=False)
    direction: Mapped[str] = mapped_column(String(12), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    dry_run: Mapped[bool] = mapped_column(Boolean, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    total_rows: Mapped[int] = mapped_column(Integer, nullable=False)
    valid_rows: Mapped[int] = mapped_column(Integer, nullable=False)
    invalid_rows: Mapped[int] = mapped_column(Integer, nullable=False)
    inserted_rows: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    errors: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    errors_truncated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    artifact_storage_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    artifact_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    artifact_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    artifact_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
