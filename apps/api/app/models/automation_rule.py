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
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.work_package import WP_PRIORITIES, WP_STATUSES, WP_TYPES


def _sql_in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


# Field-specific value vocabulary, fully closed at the DB level (v81.1 R1-④):
# both-or-neither is absorbed — a NULL condition_value satisfies none of the OR
# branches, so `condition_field IS NULL` is required whenever the value is NULL.
_CONDITION_CHECK = (
    "condition_field IS NULL"
    f" OR (condition_field = 'status' AND condition_value IN ({_sql_in(WP_STATUSES)}))"
    f" OR (condition_field = 'type' AND condition_value IN ({_sql_in(WP_TYPES)}))"
    f" OR (condition_field = 'priority' AND condition_value IN ({_sql_in(WP_PRIORITIES)}))"
)

# Supported trigger/action vocabulary. Kept a closed CHECK-constrained set; the
# columns are generic so more (trigger, action) pairs are additive later. Every
# implemented pairs watch `status` and write a DIFFERENT field (priority /
# assignee), so a rule can never re-trigger itself or another status rule.
# set_assignee shipped WITH the per-WP execution log (Pass 16 — the Pass 13
# ruling required the audit trail first).
TRIGGER_TYPES = ("status_changed_to", "type_changed_to", "priority_changed_to")
ACTION_TYPES = ("set_priority", "set_assignee")
# Optional AND secondary condition (Pass 81): a rule may require the WP's
# pre_automation state (post-user-change, pre-automation-write) to equal
# condition_value on condition_field. Closed vocabulary — same fields the
# triggers watch, evaluated as read-only equality (never a write, so single-pass
# stays intact). Both columns NULL = no secondary condition (legacy behavior).
CONDITION_FIELDS = ("status", "type", "priority")


class AutomationRule(Base):
    """A project automation rule (PLAN §3 Phase 3 자동화).

    Evaluated in the same transaction as the work-package change that triggers it,
    single-pass (an automated field write never re-evaluates the rules)."""

    __tablename__ = "automation_rules"
    __table_args__ = (
        CheckConstraint(
            "trigger_type IN ('status_changed_to', 'type_changed_to', 'priority_changed_to')",
            name="automation_trigger_allowed",
        ),
        CheckConstraint(
            "action_type IN ('set_priority', 'set_assignee')", name="automation_action_allowed"
        ),
        CheckConstraint(_CONDITION_CHECK, name="automation_condition_allowed"),
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
    # 64: wide enough for a UUID string (set_assignee) — widened in 0036.
    action_value: Mapped[str] = mapped_column(String(64), nullable=False)
    # Optional AND secondary condition (Pass 81) — both NULL = none. Evaluated as
    # equality on the pre_automation state; a read-only check, never a write.
    condition_field: Mapped[str | None] = mapped_column(String(30), nullable=True)
    condition_value: Mapped[str | None] = mapped_column(String(30), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Fire-audit surface. Since Pass 16: fired = the rule's change was ACTUALLY
    # applied (candidate selection alone no longer counts) — kept in lockstep
    # with automation_rule_runs, updated in the applying transaction.
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fired_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AutomationRuleRun(Base):
    """Per-work-package automation execution log (Pass 16 PR-AG).

    One row per ACTUALLY APPLIED automation write, inserted in the same
    transaction as the change. rule/work-package references are SET NULL with
    readable snapshots so the audit trail survives deletes; project delete
    removes everything (whole-project cascade policy)."""

    __tablename__ = "automation_rule_runs"
    __table_args__ = (
        Index("ix_rule_runs_project_created", "project_id", "created_at"),
        Index("ix_rule_runs_wp", "work_package_id"),
        Index("ix_rule_runs_rule", "rule_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    rule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("automation_rules.id", ondelete="SET NULL"), nullable=True
    )
    rule_name: Mapped[str] = mapped_column(String(80), nullable=False)
    work_package_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_packages.id", ondelete="SET NULL"), nullable=True
    )
    work_package_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    field: Mapped[str] = mapped_column(String(30), nullable=False)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
