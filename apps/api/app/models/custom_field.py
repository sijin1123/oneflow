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
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

CUSTOM_FIELD_TYPES = ("text", "number", "boolean", "date", "dropdown", "member", "url")


class CustomField(Base):
    """A project-scoped custom field definition (expansion Pass 3 PR-I).

    field_type is immutable after creation (changing it would corrupt stored
    values). Operational removal is `is_active=false` (hides the input, keeps
    values); hard DELETE is DB-guarded by the RESTRICT FK on values — a field
    that still has values cannot be dropped even by raw SQL."""

    __tablename__ = "custom_fields"
    __table_args__ = (
        CheckConstraint(
            "field_type IN ('text', 'number', 'boolean', 'date', 'dropdown', 'member', 'url')",
            name="field_type_allowed",
        ),
        UniqueConstraint("project_id", "name", name="uq_custom_fields_project_name"),
        Index("ix_custom_fields_project", "project_id", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    field_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # dropdown only: list of option strings. Removed options leave orphan values
    # (kept + displayed); validation applies at WRITE time only.
    options: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class WpCustomValue(Base):
    """One stored value per (work package, field). JSONB payload typed by the
    field's field_type; validated at the single write fan-in in the router."""

    __tablename__ = "wp_custom_values"
    __table_args__ = (
        UniqueConstraint("work_package_id", "field_id", name="uq_wp_custom_values_wp_field"),
        Index("ix_wp_custom_values_field", "field_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_package_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_packages.id", ondelete="CASCADE"), nullable=False
    )
    # RESTRICT: deleting a field that still has values fails at the DB level —
    # the TOCTOU between an API count-check and the DELETE cannot lose data.
    field_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("custom_fields.id", ondelete="RESTRICT"), nullable=False
    )
    value: Mapped[dict | list | str | int | float | bool] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
