import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

WP_TYPES = ("task", "bug", "feature", "milestone")
WP_STATUSES = ("backlog", "todo", "in_progress", "in_review", "done", "cancelled")
WP_PRIORITIES = ("none", "low", "medium", "high", "urgent")
# Single completion policy: every "open vs closed" aggregation (dashboard, my
# work, cycle/module progress) must use this — never a local status list.
WP_CLOSED_STATUSES = ("done", "cancelled")


def _in_clause(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{v}'" for v in values)
    return f"{column} IN ({quoted})"


class WorkPackage(Base):
    """OneFlow work package — independently designed schema (clean-room).

    Concurrency token is the integer `version` column (bumped on every successful
    write); `updated_at` is a pure audit timestamp (PLAN §6.2/§7, v5.1).
    """

    __tablename__ = "work_packages"
    __table_args__ = (
        CheckConstraint(_in_clause("type", WP_TYPES), name="type_allowed"),
        CheckConstraint(_in_clause("status", WP_STATUSES), name="status_allowed"),
        CheckConstraint(_in_clause("priority", WP_PRIORITIES), name="priority_allowed"),
        # Self-parenting blocked at DB level.
        CheckConstraint("parent_id <> id", name="parent_not_self"),
        # Composite-FK anchor: lets (parent_id, project_id) and relations reference
        # (id, project_id), making cross-project links unrepresentable (PLAN §7).
        UniqueConstraint("id", "project_id", name="uq_work_packages_id_project"),
        # PostgreSQL 15+ column-list SET NULL: on parent delete only parent_id clears.
        ForeignKeyConstraint(
            ["parent_id", "project_id"],
            ["work_packages.id", "work_packages.project_id"],
            name="fk_work_packages_parent_same_project",
            ondelete="SET NULL (parent_id)",
        ),
        Index("ix_work_packages_project_status", "project_id", "status"),
        Index(
            "ix_work_packages_project_updated_desc",
            "project_id",
            text("updated_at DESC"),
        ),
        Index("ix_work_packages_parent", "parent_id"),
        Index("ix_work_packages_assignee", "assignee_id"),
        Index("ix_work_packages_milestone", "milestone_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False, default="task")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="backlog")
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="none")
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Optional milestone assignment (Phase 2). SET NULL on milestone delete.
    milestone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("milestones.id", ondelete="SET NULL"), nullable=True
    )
    # Planned effort in hours (Phase 3 time tracking). Spent/remaining are derived
    # from time_entries, not stored.
    estimated_hours: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    # Optimistic-concurrency token (v5.1): +1 on every successful write.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
