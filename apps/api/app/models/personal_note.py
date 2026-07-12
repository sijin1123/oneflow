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
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PersonalNote(Base):
    """Private scratch note owned by exactly one workspace user."""

    __tablename__ = "personal_notes"
    __table_args__ = (
        CheckConstraint("char_length(title) BETWEEN 0 AND 120", name="title_length"),
        CheckConstraint("char_length(body) <= 4000", name="body_length"),
        CheckConstraint(
            "color IN ('lavender', 'mint', 'yellow', 'rose', 'blue', 'gray')",
            name="color_allowed",
        ),
        CheckConstraint("position >= 0", name="position_nonnegative"),
        CheckConstraint("version >= 0", name="version_nonnegative"),
        Index("ix_personal_notes_user_pinned_position", "user_id", "is_pinned", "position"),
        Index(
            "uq_personal_notes_one_blank_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("btrim(title) = '' AND btrim(body) = ''"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    color: Mapped[str] = mapped_column(String(16), nullable=False, default="lavender")
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
