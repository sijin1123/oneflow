import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WorkspaceQuickLink(Base):
    """Private Workspace Home shortcut owned by one user."""

    __tablename__ = "workspace_quick_links"
    __table_args__ = (
        CheckConstraint("char_length(title) BETWEEN 1 AND 80", name="title_length"),
        CheckConstraint("char_length(destination) BETWEEN 1 AND 2048", name="destination_length"),
        CheckConstraint("position >= 0", name="position_nonnegative"),
        CheckConstraint("version >= 0", name="version_nonnegative"),
        Index("ix_workspace_quick_links_user_position", "user_id", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(80), nullable=False)
    destination: Mapped[str] = mapped_column(String(2048), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
