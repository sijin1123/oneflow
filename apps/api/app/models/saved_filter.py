import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SavedFilter(Base):
    """A named, per-user work-package filter for a project (PLAN §3 Phase 2 저장 필터).

    `params` mirrors the list query string (status/priority/type/q) as JSONB — the
    frontend applies it by writing those URL search params."""

    __tablename__ = "saved_filters"
    __table_args__ = (
        # No two filters with the same name for one user in one project.
        UniqueConstraint("project_id", "user_id", "name", name="uq_saved_filter_name"),
        Index("ix_saved_filters_project_user", "project_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    params: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
