import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Cycle status is DERIVED from the date range against today, never stored:
# upcoming (start > today) / active (start <= today <= end) / completed (end < today).
CYCLE_STATUSES = ("upcoming", "active", "completed")


class Cycle(Base):
    """A time-boxed iteration (sprint) inside one project (expansion Pass 1 PR-C).

    Work packages reference it via work_packages.cycle_id. The composite FK
    (cycle_id, project_id) → (id, project_id) makes cross-project assignment
    unrepresentable at the DB level; on delete only cycle_id clears (PG15+
    column-list SET NULL) — same house pattern as work-package parents.
    Overlapping cycles are allowed (matches the reference products)."""

    __tablename__ = "cycles"
    __table_args__ = (
        CheckConstraint("start_date <= end_date", name="date_order"),
        # Composite-FK anchor for work_packages.cycle_id (see class docstring).
        UniqueConstraint("id", "project_id", name="uq_cycles_id_project"),
        Index("ix_cycles_project", "project_id", "start_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
