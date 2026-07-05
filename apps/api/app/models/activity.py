import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# System activity events recorded on a work package's history timeline.
ACTIVITY_ACTIONS = ("created", "field_changed", "commented")


class Activity(Base):
    """Append-only history record for a work package (PLAN §3 Phase 1 follow-up).

    field/old_value/new_value are populated only for 'field_changed'. Values are
    stored as text renderings — this is a display log, not an authoritative audit
    trail (the Phase 3 audit log is a separate concern)."""

    __tablename__ = "activities"
    __table_args__ = (
        CheckConstraint(
            "action IN ('created', 'field_changed', 'commented')", name="action_allowed"
        ),
        Index("ix_activities_wp_created", "work_package_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_package_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_packages.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    field: Mapped[str | None] = mapped_column(String(40), nullable=True)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
