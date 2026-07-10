import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProjectTemplate(Base):
    """A soft-deletable, named project-settings template."""

    __tablename__ = "project_templates"
    __table_args__ = (
        CheckConstraint("char_length(name) BETWEEN 1 AND 120", name="name_length"),
        Index(
            "uq_project_templates_active_name",
            "name",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_project_templates_source_project", "source_project_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class ProjectTemplateRevision(Base):
    """Immutable validated settings snapshot for one template version."""

    __tablename__ = "project_template_revisions"
    __table_args__ = (
        CheckConstraint("version >= 1", name="version_positive"),
        CheckConstraint("jsonb_typeof(snapshot) = 'object'", name="snapshot_object"),
        UniqueConstraint("template_id", "version", name="uq_project_template_revision_version"),
        UniqueConstraint("template_id", "id", name="uq_project_template_revision_identity"),
        Index("ix_project_template_revisions_template", "template_id", "version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("project_templates.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ProjectTemplateApplication(Base):
    """Durable audit row for an application of a specific immutable revision."""

    __tablename__ = "project_template_applications"
    __table_args__ = (
        ForeignKeyConstraint(
            ["template_id", "revision_id"],
            ["project_template_revisions.template_id", "project_template_revisions.id"],
            name="fk_project_template_application_revision_identity",
            ondelete="RESTRICT",
        ),
        Index("ix_project_template_applications_template_created", "template_id", "created_at"),
        Index("ix_project_template_applications_project_created", "project_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("project_templates.id", ondelete="RESTRICT"), nullable=False
    )
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False
    )
    applied_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ProjectTemplateEvent(Base):
    """Durable actor audit for catalog lifecycle changes."""

    __tablename__ = "project_template_events"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('created','revision_created','archived','unarchived','deleted')",
            name="event_type_allowed",
        ),
        CheckConstraint(
            "(event_type IN ('created','revision_created') AND revision_id IS NOT NULL) OR "
            "(event_type IN ('archived','unarchived','deleted') AND revision_id IS NULL)",
            name="event_revision_shape",
        ),
        ForeignKeyConstraint(
            ["template_id", "revision_id"],
            ["project_template_revisions.template_id", "project_template_revisions.id"],
            name="fk_project_template_event_revision_identity",
            ondelete="RESTRICT",
        ),
        Index("ix_project_template_events_template_created", "template_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("project_templates.id", ondelete="RESTRICT"), nullable=False
    )
    revision_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
