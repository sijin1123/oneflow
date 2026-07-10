import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, ForeignKeyConstraint, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProjectDocumentComment(Base):
    """Flat plain-text comment on a wiki page (Pass 43 slice 1).

    Deliberately LIGHT: no threading, no mentions, no reactions — the document
    body is the rich surface; comments are margin notes. author_id survives
    user deletion via SET NULL (WP-comment contract); rows die with their
    document/project (CASCADE). Inline anchors (positions in the body) are an
    explicitly deferred editor-integration design."""

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
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
