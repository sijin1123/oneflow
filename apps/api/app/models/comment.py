import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WorkPackageComment(Base):
    """`parent_id` nests a reply under a ROOT comment (single level — enforced at
    the create_comment entry point; the composite same-WP FK makes cross-WP
    replies unrepresentable and promotes replies on root delete, Pass 10)."""

    __tablename__ = "work_package_comments"
    __table_args__ = (
        UniqueConstraint("id", "work_package_id", name="uq_comments_id_wp"),
        ForeignKeyConstraint(
            ["parent_id", "work_package_id"],
            ["work_package_comments.id", "work_package_comments.work_package_id"],
            name="fk_comments_parent_same_wp",
            ondelete="SET NULL (parent_id)",
        ),
        Index("ix_comments_parent", "parent_id"),
        Index("ix_comments_wp_created", "work_package_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_package_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("work_packages.id", ondelete="CASCADE"),
        nullable=False,
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # Accepted mention user-ids (JSONB string list) — the canonical mention
    # representation (PLAN v10.1 R1-②): what was accepted is what renders.
    # none_as_null: a Python None must be SQL NULL, not JSON 'null' (PR #76).
    mentions: Mapped[list | None] = mapped_column(JSONB(none_as_null=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
