import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Supported trigger/action vocabulary. Kept a closed CHECK-constrained set; the
# columns are generic so more (trigger, action) pairs are additive later. Every
# implemented pair deliberately watches `status` and writes `priority` — trigger
# and action touch different fields, so a rule can never re-trigger itself.
# (set_assignee is deferred until a per-WP execution log exists — v13.1 R1-⑤.)
TRIGGER_TYPES = ("status_changed_to",)
ACTION_TYPES = ("set_priority",)


class AutomationRule(Base):
    """A project automation rule (PLAN §3 Phase 3 자동화).

    Evaluated in the same transaction as the work-package change that triggers it,
    single-pass (an automated field write never re-evaluates the rules)."""

    __tablename__ = "automation_rules"
    __table_args__ = (
        CheckConstraint("trigger_type IN ('status_changed_to')", name="automation_trigger_allowed"),
        CheckConstraint("action_type IN ('set_priority')", name="automation_action_allowed"),
        Index("ix_automation_rules_project", "project_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(30), nullable=False)
    trigger_value: Mapped[str] = mapped_column(String(30), nullable=False)
    action_type: Mapped[str] = mapped_column(String(30), nullable=False)
    action_value: Mapped[str] = mapped_column(String(30), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Minimal fire-audit surface (Pass 13): updated in the firing transaction.
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fired_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
