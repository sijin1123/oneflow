import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserNotificationSettings(Base):
    """Per-user notification toggles (expansion Pass 2 PR-E2).

    Absent row = all defaults (True) — no backfill needed. Preferences are
    evaluated ONLY at fan-out time: turning a kind off stops NEW notifications;
    already-created ones are never retro-hidden and unread counts keep their
    existing definition. Toggle→kind mapping: `assigned` → 'assigned',
    `watched` → 'watch_status'+'watch_assigned', `commented` → 'watch_comment',
    `mention` → 'mention'."""

    __tablename__ = "user_notification_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    assigned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    watched: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    commented: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    mention: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Gates due_soon + overdue creation (Pass 40) — creation-only, like the rest.
    due_alerts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Gates intake_accepted/intake_declined creation (Pass 49).
    intake: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Gates all initiative_* creation; durable subscriptions stay unchanged.
    initiatives: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
