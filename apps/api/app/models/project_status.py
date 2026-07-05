import uuid

from sqlalchemy import ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Default per-project workflow: the built-in status keys with display labels and
# order. Every project is seeded with these; owners may rename/reorder them. The
# KEYS stay the fixed WP_STATUSES set (work_packages.status is still validated
# against them), so this table is a presentation/config layer, not a schema change.
DEFAULT_STATUSES: tuple[tuple[str, str, int], ...] = (
    ("backlog", "백로그", 0),
    ("todo", "할 일", 1),
    ("in_progress", "진행 중", 2),
    ("in_review", "검토 중", 3),
    ("done", "완료", 4),
    ("cancelled", "취소", 5),
)


class ProjectStatus(Base):
    """Per-project label + ordering for a work-package status key (PLAN §3 Phase 3
    워크플로우 커스터마이징)."""

    __tablename__ = "project_statuses"
    __table_args__ = (
        UniqueConstraint("project_id", "key", name="uq_project_status_key"),
        Index("ix_project_statuses_project", "project_id", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    # One of WP_STATUSES — the stable identity the work package stores.
    key: Mapped[str] = mapped_column(String(20), nullable=False)
    # Display label the project chose for that key.
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
