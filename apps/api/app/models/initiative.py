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

INITIATIVE_STATES = ("planned", "in_progress", "paused", "completed", "cancelled")


class Initiative(Base):
    """A cross-project strategic grouping (expansion Pass 3 PR-L).

    Workspace-level: any authenticated user may create one. Visibility is
    derived, never stored — you see an initiative if you created it or you are
    a member of at least one connected project; roll-ups only aggregate the
    projects YOU can see (no cross-project leakage). Edits are creator-only."""

    __tablename__ = "initiatives"
    __table_args__ = (
        CheckConstraint(
            "state IN ('planned', 'in_progress', 'paused', 'completed', 'cancelled')",
            name="state_allowed",
        ),
        CheckConstraint(
            "start_date IS NULL OR target_date IS NULL OR start_date <= target_date",
            name="date_order",
        ),
        Index("ix_initiatives_owner", "owner_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Creator; SET NULL keeps the initiative if the user is later deleted.
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
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


class InitiativeProject(Base):
    """Connects an initiative to a project (many-to-many)."""

    __tablename__ = "initiative_projects"
    __table_args__ = (
        UniqueConstraint("initiative_id", "project_id", name="uq_initiative_projects_pair"),
        Index("ix_initiative_projects_project", "project_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    initiative_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("initiatives.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
