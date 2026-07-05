import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Notification kinds. Kept a closed set (CHECK-constrained) so the UI can render a
# known message per kind. Currently only assignment; more triggers are additive.
NOTIFICATION_KINDS = ("assigned",)


class Notification(Base):
    """Per-user inbox row (PLAN §3 Phase 2 알림).

    Written in the same transaction as the domain change that triggers it, so a
    rolled-back assignment never leaves a dangling notification."""

    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint("kind IN ('assigned')", name="notification_kind_allowed"),
        # Feed query: a user's notifications newest-first.
        Index("ix_notifications_user_created", "user_id", "created_at"),
        # Unread-count query.
        Index("ix_notifications_user_read", "user_id", "read"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Recipient.
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    work_package_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_packages.id", ondelete="CASCADE"), nullable=True
    )
    # Who caused it; SET NULL keeps the notification if the actor is later removed.
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
