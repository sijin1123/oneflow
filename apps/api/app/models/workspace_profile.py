import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WorkspaceProfile(Base):
    """The single workspace identity record."""

    __tablename__ = "workspace_profiles"
    __table_args__ = (
        CheckConstraint("id = 1", name="workspace_profile_singleton"),
        CheckConstraint(
            "length(btrim(name)) BETWEEN 1 AND 80",
            name="workspace_profile_name_not_blank",
        ),
        CheckConstraint("revision >= 1", name="workspace_profile_revision_positive"),
    )

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    name: Mapped[str] = mapped_column(String(80), nullable=False, default="OneFlow")
    revision: Mapped[int] = mapped_column(BigInteger, nullable=False, default=1)
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
