import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SavedFilter(Base):
    """A named work-package view for a project (Phase 2 저장 필터 → Pass 2 Views).

    `params` mirrors the list query string as JSONB — the frontend applies it by
    writing those URL search params. `layout` picks the screen, `is_shared`
    exposes the view read-only to project members (edits stay author-only)."""

    __tablename__ = "saved_filters"
    __table_args__ = (
        # No two filters with the same name for one user in one project.
        UniqueConstraint("project_id", "user_id", "name", name="uq_saved_filter_name"),
        CheckConstraint(
            "layout IN ('list', 'board', 'tree', 'timeline', 'calendar')",
            name="layout_allowed",
        ),
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
    layout: Mapped[str] = mapped_column(String(20), nullable=False, default="list")
    sort: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_shared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
