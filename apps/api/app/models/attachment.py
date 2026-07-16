import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Attachment(Base):
    """Project file/attachment METADATA (follow-up collaboration module).

    Two flavors share this table: URL-only rows (external reference in `url`)
    and uploaded rows (blob under `storage_key` via the storage abstraction,
    Pass 4 PR-M). Both are member-scoped metadata; the binary itself never
    carries user-controlled paths."""

    __tablename__ = "attachments"
    __table_args__ = (
        # At most ONE anchor; deleting the anchor SET-NULLs it — the file stays
        # a plain project attachment (data-preservation ruling, Pass 23).
        CheckConstraint(
            "NOT (work_package_id IS NOT NULL AND document_id IS NOT NULL)",
            name="single_anchor",
        ),
        ForeignKeyConstraint(
            ["work_package_id", "project_id"],
            ["work_packages.id", "work_packages.project_id"],
            name="fk_attachments_wp_same_project",
            ondelete="SET NULL (work_package_id)",
        ),
        ForeignKeyConstraint(
            ["document_id", "project_id"],
            ["project_documents.id", "project_documents.project_id"],
            name="fk_attachments_document_same_project",
            ondelete="SET NULL (document_id)",
        ),
        Index("ix_attachments_wp", "work_package_id"),
        Index("ix_attachments_document", "document_id"),
        Index("ix_attachments_project_created", "project_id", "created_at"),
        Index(
            "ix_attachments_project_search_status_created",
            "project_id",
            "search_index_status",
            "created_at",
        ),
        CheckConstraint(
            "search_index_status IN "
            "('not_applicable','pending','indexed','unsupported','too_large',"
            "'invalid_text','missing_blob')",
            name="search_index_status_allowed",
        ),
        CheckConstraint(
            "COALESCE(char_length(search_text), 0) <= 524288 AND ("
            "(search_index_status = 'indexed' AND search_text IS NOT NULL "
            "AND search_indexed_at IS NOT NULL) OR "
            "(search_index_status IN "
            "('unsupported','too_large','invalid_text','missing_blob') "
            "AND search_text IS NULL AND search_indexed_at IS NOT NULL) OR "
            "(search_index_status IN ('pending','not_applicable') "
            "AND search_text IS NULL AND search_indexed_at IS NULL))",
            name="search_text_shape",
        ),
        UniqueConstraint("id", "project_id", name="uq_attachments_id_project_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    work_package_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # External reference (http/https) — validated at the schema layer. Uploaded
    # rows carry the "oneflow://attachments/{id}" sentinel (url stays NOT NULL so
    # pre-upload code degrades to a dead link, never a crash — PLAN P4-1).
    url: Mapped[str] = mapped_column(Text, nullable=False)
    # Server-generated blob key ("{project_id}/{attachment_id}"); UNIQUE so two
    # rows can never share (and cross-delete) one blob. NULL = URL-only row.
    storage_key: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    search_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    search_index_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="not_applicable",
        server_default="not_applicable",
    )
    search_indexed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
