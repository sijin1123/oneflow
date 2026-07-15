import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

AUTH_ASSISTANCE_KINDS = ("sign_in_help", "workspace_access")
AUTH_ASSISTANCE_STATUSES = ("pending", "in_review", "resolved", "rejected")
AUTH_ASSISTANCE_OPEN_STATUSES = ("pending", "in_review")


class AuthAssistanceRequest(Base):
    """Durable, privacy-preserving login help request."""

    __tablename__ = "auth_assistance_requests"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('sign_in_help', 'workspace_access')",
            name="kind_allowed",
        ),
        CheckConstraint(
            "status IN ('pending', 'in_review', 'resolved', 'rejected')",
            name="status_allowed",
        ),
        CheckConstraint("submission_count >= 1", name="submission_count_positive"),
        CheckConstraint("version >= 1", name="version_positive"),
        CheckConstraint(
            "status NOT IN ('pending', 'in_review') OR email IS NOT NULL",
            name="open_email_required",
        ),
        Index("ix_auth_assistance_status_created", "status", "created_at"),
        Index(
            "uq_auth_assistance_open_kind_email",
            "kind",
            "email",
            unique=True,
            postgresql_where=text("status IN ('pending', 'in_review')"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending"
    )
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    submission_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    last_submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    triage_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    triaged_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    triaged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    redacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class AuthAssistanceRateLimit(Base):
    """Singleton database bucket for an atomic workspace-wide submission cap."""

    __tablename__ = "auth_assistance_rate_limits"
    __table_args__ = (
        CheckConstraint("id = 1", name="singleton"),
        CheckConstraint("attempt_count >= 0", name="attempt_count_nonnegative"),
    )

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    window_started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    attempt_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
