import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

RELATION_TYPES = ("blocks", "precedes", "follows", "relates")


class WorkPackageRelation(Base):
    """Same-project invariant is DB-enforced from migration 0001: the relation row
    carries project_id and BOTH endpoints reference (id, project_id), so a
    cross-project relation row is unrepresentable (PLAN §6.1/§7, R4 승격)."""

    __tablename__ = "work_package_relations"
    __table_args__ = (
        UniqueConstraint(
            "source_id", "target_id", "relation_type", name="uq_relations_source_target_type"
        ),
        CheckConstraint("source_id <> target_id", name="not_self"),
        CheckConstraint(
            "relation_type IN ('blocks', 'precedes', 'follows', 'relates')",
            name="relation_type_allowed",
        ),
        ForeignKeyConstraint(
            ["source_id", "project_id"],
            ["work_packages.id", "work_packages.project_id"],
            name="fk_relations_source_same_project",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["target_id", "project_id"],
            ["work_packages.id", "work_packages.project_id"],
            name="fk_relations_target_same_project",
            ondelete="CASCADE",
        ),
        Index("ix_relations_source", "source_id"),
        Index("ix_relations_target", "target_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    relation_type: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
