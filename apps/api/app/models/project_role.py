import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProjectRole(Base):
    """Workspace-managed role layered on the built-in project member role."""

    __tablename__ = "project_roles"
    __table_args__ = (
        CheckConstraint(
            "char_length(name) BETWEEN 1 AND 50 AND name = btrim(name)",
            name="name_valid",
        ),
        CheckConstraint(
            "lower(name) NOT IN ('owner', 'member', 'viewer')",
            name="name_not_reserved",
        ),
        CheckConstraint(
            "description IS NULL OR char_length(description) BETWEEN 1 AND 200",
            name="description_valid",
        ),
        CheckConstraint(
            "jsonb_typeof(permissions) = 'array' AND jsonb_array_length(permissions) <= 7 "
            'AND permissions <@ \'["status.manage","project_type.manage",'
            '"field.manage","cycle.manage","module.manage",'
            '"automation.manage","intake.triage"]\'::jsonb',
            name="permissions_array",
        ),
        CheckConstraint("revision >= 1", name="revision_positive"),
        Index("ix_project_roles_archived_name", "archived_at", "name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    permissions: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    revision: Mapped[int] = mapped_column(BigInteger, nullable=False, default=1)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_name: Mapped[str] = mapped_column(String(120), nullable=False)
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by_name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


Index("uq_project_roles_lower_name", func.lower(ProjectRole.name), unique=True)


class ProjectRoleEvent(Base):
    """Append-only actor and state snapshot for role lifecycle changes."""

    __tablename__ = "project_role_events"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('created','updated','archived','restored')",
            name="event_type_allowed",
        ),
        CheckConstraint("jsonb_typeof(snapshot) = 'object'", name="snapshot_object"),
        Index("ix_project_role_events_role_created", "role_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("project_roles.id", ondelete="RESTRICT"), nullable=False
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_name: Mapped[str] = mapped_column(String(120), nullable=False)
    event_type: Mapped[str] = mapped_column(String(20), nullable=False)
    revision: Mapped[int] = mapped_column(BigInteger, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
