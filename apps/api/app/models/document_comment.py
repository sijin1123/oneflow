import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProjectDocumentComment(Base):
    """Plain-text page comment, optionally attached to an inline body anchor.

    Null anchor metadata preserves the legacy page-level margin-note contract.
    Multiple rows may share one anchor_id and form a chronological thread.
    author_id survives user deletion via SET NULL; rows die with their
    document/project (CASCADE).
    """

    __tablename__ = "project_document_comments"
    __table_args__ = (
        # Same-project composite FK (v43.1) — reuses the 0029 unique; comments
        # die with their document (CASCADE).
        ForeignKeyConstraint(
            ["document_id", "project_id"],
            ["project_documents.id", "project_documents.project_id"],
            name="fk_document_comments_doc_same_project",
            ondelete="CASCADE",
        ),
        Index("ix_document_comments_doc_created", "document_id", "created_at"),
        Index(
            "ix_document_comments_doc_anchor_created",
            "document_id",
            "anchor_id",
            "created_at",
            "id",
        ),
        CheckConstraint(
            "(anchor_id IS NULL AND anchor_quote IS NULL) OR "
            "(anchor_id IS NOT NULL AND anchor_quote IS NOT NULL "
            "AND char_length(anchor_quote) BETWEEN 1 AND 500)",
            name="anchor_shape",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    anchor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    anchor_quote: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
