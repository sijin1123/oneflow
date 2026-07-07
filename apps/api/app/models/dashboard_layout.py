import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Closed widget vocabulary — the fixed dashboard sections, in default order.
# Adding/removing a widget later = rewrite the CHECK (raw SQL) + clean rows.
WIDGET_KEYS = (
    "summary",
    "budget",
    "progress",
    "status_distribution",
    "priority_distribution",
    "recent_activity",
)


class DashboardLayout(Base):
    """Per-user dashboard widget layout (Pass 18 PR-AJ).

    PERSONAL display preference: visible only to its owner, exempt from the
    archived-project write gate (v18.1 R1-③), preserved when a member leaves
    (restored on rejoin — R1-④). Last-write-wins by design (R1-①): only the
    owner edits it and a lost update is self-correcting. DB CHECK holds the
    vocabulary + non-empty minimum; the API normalizes duplicates (R1-②)."""

    __tablename__ = "dashboard_layouts"
    __table_args__ = (
        CheckConstraint(
            "jsonb_typeof(widgets) = 'array' AND jsonb_array_length(widgets) >= 1 "
            'AND widgets <@ \'["summary", "budget", "progress", '
            '"status_distribution", "priority_distribution", '
            '"recent_activity"]\'::jsonb',
            name="widgets_valid",
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    widgets: Mapped[list] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
