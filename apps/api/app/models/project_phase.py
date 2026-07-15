import uuid
from datetime import date

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

PROJECT_PHASES: tuple[tuple[str, str, str, int], ...] = (
    ("discover", "발견", "sky", 0),
    ("plan", "계획", "indigo", 1),
    ("deliver", "실행", "emerald", 2),
    ("close", "마감", "amber", 3),
)
PROJECT_PHASE_BY_KEY = {phase[0]: phase for phase in PROJECT_PHASES}

# Gate labels are product vocabulary, not user-managed project data. Their
# activation state is persisted on the phase; their dates are API-derived.
PROJECT_PHASE_GATE_NAMES: dict[str, tuple[str, str]] = {
    "discover": ("발견 시작 게이트", "발견 완료 게이트"),
    "plan": ("계획 시작 게이트", "계획 완료 게이트"),
    "deliver": ("실행 시작 게이트", "실행 완료 게이트"),
    "close": ("마감 시작 게이트", "마감 완료 게이트"),
}


class ProjectPhase(Base):
    """Persisted per-project state keyed by a workspace phase definition."""

    __tablename__ = "project_phases"
    __table_args__ = (
        UniqueConstraint("project_id", "key", name="uq_project_phases_project_key"),
        CheckConstraint(
            "key IN ('discover', 'plan', 'deliver', 'close') OR key ~ '^custom_[0-9a-f]{32}$'",
            name="key_allowed",
        ),
        CheckConstraint(
            "start_date IS NULL OR end_date IS NULL OR start_date <= end_date",
            name="dates_ordered",
        ),
        CheckConstraint("version >= 0", name="version_nonnegative"),
        Index("ix_project_phases_project_key", "project_id", "key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    key: Mapped[str] = mapped_column(String(48), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    start_gate_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    finish_gate_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
