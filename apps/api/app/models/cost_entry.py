import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

COST_KINDS = ("labor", "material", "other")


class CostEntry(Base):
    """A logged cost against a work package (PLAN §3 Phase 3 cost tracking)."""

    __tablename__ = "cost_entries"
    __table_args__ = (
        CheckConstraint("amount > 0 AND amount <= 100000000", name="amount_range"),
        CheckConstraint("kind IN ('labor', 'material', 'other')", name="kind_allowed"),
        Index("ix_cost_entries_wp", "work_package_id", "spent_on"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_package_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_packages.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="labor")
    spent_on: Mapped[date] = mapped_column(Date, nullable=False)
    comment: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
