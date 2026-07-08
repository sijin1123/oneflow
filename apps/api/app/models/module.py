import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Unlike cycles, module state is EXPLICIT (a feature group progresses by
# decision, not by calendar) — matches the reference product's semantics.
MODULE_STATES = ("planned", "in_progress", "paused", "completed", "cancelled")


class Module(Base):
    """A feature/release grouping inside one project (expansion Pass 1 PR-D).

    Work packages reference it via work_packages.module_id under the same
    composite same-project FK + column-list SET NULL pattern as cycles.
    lead_id must be a project member at write time (API 422); removing that
    member later keeps the lead for history — only deleting the user clears it."""

    __tablename__ = "modules"
    __table_args__ = (
        CheckConstraint(
            "state IN ('planned', 'in_progress', 'paused', 'completed', 'cancelled')",
            name="state_allowed",
        ),
        # Both dates are optional; the order only binds when both exist.
        CheckConstraint(
            "start_date IS NULL OR target_date IS NULL OR start_date <= target_date",
            name="date_order",
        ),
        # Composite-FK anchor for work_packages.module_id.
        UniqueConstraint("id", "project_id", name="uq_modules_id_project"),
        Index("ix_modules_project", "project_id", "state"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="planned")
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class ModuleMember(Base):
    """Module participant roster row (Pass 65, v65.1). A LIVING grouping —
    reads always re-filter to currently-eligible users (active AND project
    member AND role != viewer), so a stale row is invisible, not wrong."""

    __tablename__ = "module_members"
    __table_args__ = (
        # Composite FK through uq_modules_id_project: cross-project rows are
        # unrepresentable (house pattern — cycles/WP anchors).
        ForeignKeyConstraint(
            ["module_id", "project_id"],
            ["modules.id", "modules.project_id"],
            name="fk_module_members_module_project",
            ondelete="CASCADE",
        ),
        UniqueConstraint("module_id", "user_id", name="uq_module_members_module_user"),
        Index("ix_module_members_module", "module_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
