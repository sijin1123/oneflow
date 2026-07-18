import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

INITIATIVE_STATES = ("planned", "in_progress", "paused", "completed", "cancelled")
INITIATIVE_ACTIVITY_KINDS = (
    "initiative_created",
    "properties_updated",
    "lifecycle_updated",
    "health_updated",
    "owner_transferred",
    "owner_claimed",
    "labels_updated",
    "project_connected",
    "project_disconnected",
    "work_item_connected",
    "work_item_disconnected",
)


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
        CheckConstraint(
            "health IN ('on_track', 'at_risk', 'off_track')",
            name="health_allowed",
        ),
        CheckConstraint(
            "(health IS NULL AND health_note IS NULL"
            " AND health_updated_by IS NULL AND health_updated_at IS NULL)"
            " OR (health IS NOT NULL AND health_updated_at IS NOT NULL)",
            name="health_shape",
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
    # Health report (Pass 44 — the Pass-37 contract verbatim): a qualitative
    # axis SEPARATE from the lifecycle `state`; unset means fully unset.
    health: Mapped[str | None] = mapped_column(String(20), nullable=True)
    health_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    health_updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    health_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
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


class InitiativeWorkPackage(Base):
    """Explicit strategic scope constrained to a connected project."""

    __tablename__ = "initiative_work_packages"
    __table_args__ = (
        UniqueConstraint(
            "initiative_id",
            "work_package_id",
            name="uq_initiative_work_packages_pair",
        ),
        ForeignKeyConstraint(
            ["initiative_id", "project_id"],
            ["initiative_projects.initiative_id", "initiative_projects.project_id"],
            name="fk_initiative_work_packages_connected_project",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["work_package_id", "project_id"],
            ["work_packages.id", "work_packages.project_id"],
            name="fk_initiative_work_packages_same_project",
            ondelete="CASCADE",
        ),
        Index("ix_initiative_work_packages_project", "project_id"),
        Index("ix_initiative_work_packages_work_package", "work_package_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    initiative_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    work_package_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class InitiativeSubscriber(Base):
    """A user's durable request for eligible in-app initiative updates."""

    __tablename__ = "initiative_subscribers"
    __table_args__ = (
        UniqueConstraint(
            "initiative_id",
            "user_id",
            name="uq_initiative_subscribers_pair",
        ),
        Index("ix_initiative_subscribers_user", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    initiative_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("initiatives.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class InitiativeLabel(Base):
    """Workspace-managed classification available to every visible initiative."""

    __tablename__ = "initiative_labels"
    __table_args__ = (
        CheckConstraint("color ~ '^#[0-9a-f]{6}$'", name="color_hex"),
        Index("uq_initiative_labels_name_lower", text("lower(name)"), unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#64748b")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class InitiativeLabelAssignment(Base):
    """A bounded many-to-many assignment owned through the initiative lifecycle."""

    __tablename__ = "initiative_label_assignments"
    __table_args__ = (Index("ix_initiative_label_assignments_label", "label_id"),)

    initiative_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("initiatives.id", ondelete="CASCADE"),
        primary_key=True,
    )
    label_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("initiative_labels.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class InitiativeActivity(Base):
    """Append-only, display-safe history for one Initiative.

    `changed_fields` contains only a closed property vocabulary. Resource names,
    values and identifiers are deliberately absent so historical rows cannot
    bypass the Initiative's current visibility boundary.
    """

    __tablename__ = "initiative_activities"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('initiative_created', 'properties_updated', 'lifecycle_updated', "
            "'health_updated', 'owner_transferred', 'owner_claimed', 'labels_updated', "
            "'project_connected', 'project_disconnected', 'work_item_connected', "
            "'work_item_disconnected')",
            name="kind_allowed",
        ),
        CheckConstraint(
            "changed_fields <@ ARRAY['name', 'description', 'state', 'start_date', "
            "'target_date', 'health', 'health_note', 'owner', 'labels', 'projects', "
            "'work_items']::varchar[]",
            name="changed_fields_allowed",
        ),
        CheckConstraint(
            "cardinality(changed_fields) <= 7",
            name="changed_fields_bounded",
        ),
        Index(
            "ix_initiative_activities_initiative_created",
            "initiative_id",
            "created_at",
            "id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    initiative_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("initiatives.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    changed_fields: Mapped[list[str]] = mapped_column(
        ARRAY(String(24)), nullable=False, default=list, server_default="{}"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("clock_timestamp()")
    )
