import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WebhookEndpoint(Base):
    __tablename__ = "webhook_endpoints"
    __table_args__ = (
        Index("ix_webhook_endpoints_active", "is_active", "deleted_at"),
        Index("ix_webhook_endpoints_created", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    event_types: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    secret_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"
    __table_args__ = (
        Index("ix_webhook_deliveries_endpoint_created", "endpoint_id", "created_at"),
        Index("ix_webhook_deliveries_status", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    endpoint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("webhook_endpoints.id", ondelete="RESTRICT"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    response_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    attempted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
