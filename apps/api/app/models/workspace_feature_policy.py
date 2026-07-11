import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WorkspaceFeaturePolicy(Base):
    """Singleton-workspace feature policy with optimistic revision control."""

    __tablename__ = "workspace_feature_policies"
    __table_args__ = (
        CheckConstraint("feature_key IN ('wiki','ai')", name="feature_key_allowed"),
        CheckConstraint("revision >= 1", name="revision_positive"),
    )

    feature_key: Mapped[str] = mapped_column(String(40), primary_key=True)
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    revision: Mapped[int] = mapped_column(BigInteger, nullable=False, default=1)
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
