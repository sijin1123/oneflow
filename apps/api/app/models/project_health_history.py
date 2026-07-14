import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProjectHealthHistory(Base):
    """Append-only project health transitions created by the project writer."""

    __tablename__ = "project_health_history"
    __table_args__ = (
        CheckConstraint(
            "previous_health IS NULL OR previous_health IN ('on_track', 'at_risk', 'off_track')",
            name="previous_health_valid",
        ),
        CheckConstraint(
            "health IS NULL OR health IN ('on_track', 'at_risk', 'off_track')",
            name="health_valid",
        ),
        CheckConstraint(
            "previous_health IS NOT NULL OR previous_note IS NULL",
            name="previous_note_requires_health",
        ),
        CheckConstraint("health IS NOT NULL OR note IS NULL", name="note_requires_health"),
        CheckConstraint(
            "previous_health IS DISTINCT FROM health OR previous_note IS DISTINCT FROM note",
            name="report_changed",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    previous_health: Mapped[str | None] = mapped_column(String(20), nullable=True)
    previous_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    health: Mapped[str | None] = mapped_column(String(20), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.clock_timestamp()
    )
