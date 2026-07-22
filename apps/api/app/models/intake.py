import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

INTAKE_STATUSES = ("pending", "accepted", "declined", "snoozed", "duplicate")
# Triage decisions may only move OPEN items; accepted/declined/duplicate are final.
INTAKE_OPEN_STATUSES = ("pending", "snoozed")


class IntakeItem(Base):
    """A triage-queue request for a project (expansion Pass 2 PR-H).

    Members submit; owners triage. Accepting creates the work package and marks
    the item in ONE transaction guarded by a status-conditional UPDATE, so a
    concurrent accept can succeed exactly once (the loser's WP insert rolls
    back with the transaction)."""

    __tablename__ = "intake_items"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'accepted', 'declined', 'snoozed', 'duplicate')",
            name="status_allowed",
        ),
        Index("ix_intake_items_project_status", "project_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    submitted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    snooze_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    # FINAL-decision metadata (Pass 29): every triage replaces the note (null
    # when omitted); triaged_by survives user deletion (SET NULL).
    triage_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    triaged_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    triaged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_wp_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_packages.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class IntakeDecisionHistory(Base):
    """Append-only audit event for each successful intake triage decision."""

    __tablename__ = "intake_decision_history"
    __table_args__ = (
        CheckConstraint(
            "previous_status IN ('pending', 'snoozed')",
            name="previous_status_allowed",
        ),
        CheckConstraint(
            "status IN ('accepted', 'declined', 'snoozed', 'duplicate')",
            name="status_allowed",
        ),
        CheckConstraint(
            "(decided_by_profile_image_storage_key IS NULL "
            "AND decided_by_profile_image_content_type IS NULL) OR "
            "(decided_by_profile_image_storage_key IS NOT NULL "
            "AND decided_by_profile_image_content_type IS NOT NULL)",
            name="decided_by_image_metadata_complete",
        ),
        Index(
            "ix_intake_decision_history_item_created",
            "intake_item_id",
            "created_at",
            "id",
        ),
        Index(
            "ix_intake_decision_history_decided_by_image_key",
            "decided_by_profile_image_storage_key",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    intake_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("intake_items.id", ondelete="CASCADE"), nullable=False
    )
    previous_status: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    snooze_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    decided_by_name_snapshot: Mapped[str | None] = mapped_column(String(120), nullable=True)
    decided_by_profile_image_storage_key: Mapped[str | None] = mapped_column(
        String(80), nullable=True
    )
    decided_by_profile_image_content_type: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.clock_timestamp()
    )

    @property
    def decided_by_name(self) -> str | None:
        return self.decided_by_name_snapshot
