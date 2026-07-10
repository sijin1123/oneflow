import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WpWatcher(Base):
    """A user subscribed to a work package's changes (expansion Pass 2 PR-E1).

    Rows survive membership removal; the notification fan-out joins
    project_members at send time (query-time evaluation, like /me/work), so a
    revoked member silently stops receiving and resumes on re-join."""

    __tablename__ = "wp_watchers"
    __table_args__ = (
        UniqueConstraint("work_package_id", "user_id", name="uq_wp_watchers_wp_user"),
        # Future "watched by me" listing.
        Index("ix_wp_watchers_user", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_package_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_packages.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
