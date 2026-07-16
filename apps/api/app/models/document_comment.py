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
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
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
    mentions: Mapped[list | None] = mapped_column(JSONB(none_as_null=True), nullable=True)
    anchor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    anchor_quote: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ProjectDocumentCommentReaction(Base):
    """Ephemeral free-emoji reaction on a Document comment.

    Reactions die with either the comment or user. The database constraint is
    only a coarse shape backstop; app.services.emoji remains the write grammar.
    """

    __tablename__ = "document_comment_reactions"
    __table_args__ = (
        CheckConstraint(
            "char_length(emoji) BETWEEN 1 AND 16"
            " AND emoji ~ '[^\x01-\x7f]'"
            " AND emoji !~ '[[:space:][:cntrl:]]'",
            name="emoji_shape",
        ),
        UniqueConstraint(
            "comment_id",
            "user_id",
            "emoji",
            name="uq_document_comment_reactions_comment_user_emoji",
        ),
        Index("ix_document_comment_reactions_comment", "comment_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    comment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_document_comments.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    emoji: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
