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
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Nested pages: root is depth 1; a path may hold at most this many documents
# (PLAN v9.1 R1-⑥ — the 11th level is a 422, keeping the ancestor walk bounded).
MAX_DOCUMENT_DEPTH = 10


class ProjectDocument(Base):
    """A project wiki/document page (follow-up collaboration module).

    `body` holds sanitized rich-text HTML (same nh3 boundary as work-package
    descriptions). `version` is the optimistic-concurrency token (§6.2 pattern).
    `parent_id` nests pages: the composite same-project FK makes a cross-project
    parent unrepresentable, and PG15+ column-list SET NULL promotes children to
    root on parent delete (no silent subtree deletion)."""

    __tablename__ = "project_documents"
    __table_args__ = (
        CheckConstraint("visibility IN ('shared','private')", name="visibility_allowed"),
        CheckConstraint(
            "(archived_at IS NULL AND archived_by_user_id IS NULL AND archived_by_name IS NULL) "
            "OR (archived_at IS NOT NULL AND archived_by_name IS NOT NULL)",
            name="archive_audit_shape",
        ),
        UniqueConstraint("id", "project_id", name="uq_project_documents_id_project"),
        ForeignKeyConstraint(
            ["parent_id", "project_id"],
            ["project_documents.id", "project_documents.project_id"],
            name="fk_project_documents_parent_same_project",
            ondelete="SET NULL (parent_id)",
        ),
        Index("ix_project_documents_parent", "parent_id"),
        Index("ix_project_documents_project_updated", "project_id", "updated_at"),
        Index(
            "ix_project_documents_project_visibility_archive",
            "project_id",
            "visibility",
            "archived_at",
            "updated_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    visibility: Mapped[str] = mapped_column(String(12), nullable=False, default="shared")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    archived_by_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class DocumentWorkPackageLink(Base):
    """Page ↔ work-package association (expansion Pass 9 PR-V).

    An association fact, not an owned resource — both sides CASCADE. Composite
    same-project FKs make a cross-project link unrepresentable (relations
    pattern). The wp-leading index serves the reverse drawer lookup."""

    __tablename__ = "document_work_package_links"
    __table_args__ = (
        UniqueConstraint("document_id", "work_package_id", name="uq_document_wp_links_doc_wp"),
        ForeignKeyConstraint(
            ["document_id", "project_id"],
            ["project_documents.id", "project_documents.project_id"],
            name="fk_document_wp_links_document_same_project",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["work_package_id", "project_id"],
            ["work_packages.id", "work_packages.project_id"],
            name="fk_document_wp_links_wp_same_project",
            ondelete="CASCADE",
        ),
        Index("ix_document_wp_links_wp", "work_package_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    work_package_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
