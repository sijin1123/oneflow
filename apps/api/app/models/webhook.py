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
    UniqueConstraint,
    func,
)
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
    signing_key_id: Mapped[str] = mapped_column(
        String(64), nullable=False, default="legacy-v1", server_default="legacy-v1"
    )
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
    manual_window_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    manual_attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"
    __table_args__ = (
        Index("ix_webhook_deliveries_endpoint_created", "endpoint_id", "created_at"),
        Index("ix_webhook_deliveries_status", "status", "created_at"),
        Index("ix_webhook_deliveries_due", "status", "next_attempt_at", "leased_until"),
        Index("ix_webhook_deliveries_signing_snapshot", "signing_key_id", "secret_version"),
        UniqueConstraint("endpoint_id", "event_id", name="uq_webhook_delivery_endpoint_event"),
        CheckConstraint(
            "status IN "
            "('pending','sending','retrying','succeeded','failed','dead_letter','skipped')",
            name="status",
        ),
        CheckConstraint(
            "signing_snapshot_source IN ('captured','migrated_current')",
            name="signing_snapshot_source",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    endpoint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("webhook_endpoints.id", ondelete="RESTRICT"), nullable=False
    )
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    signing_key_id: Mapped[str] = mapped_column(String(64), nullable=False, default="legacy-v1")
    secret_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    signing_snapshot_source: Mapped[str] = mapped_column(
        String(24), nullable=False, default="captured", server_default="captured"
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    response_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    attempted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_owner: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # A new random token is written for every claim. Workers must present it
    # when finalizing so an expired worker can never overwrite its reclaimer.
    lease_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    leased_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class WebhookSecretRotation(Base):
    __tablename__ = "webhook_secret_rotations"
    __table_args__ = (
        Index("ix_webhook_secret_rotations_endpoint_created", "endpoint_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    endpoint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("webhook_endpoints.id", ondelete="RESTRICT"), nullable=False
    )
    previous_signing_key_id: Mapped[str] = mapped_column(String(64), nullable=False)
    signing_key_id: Mapped[str] = mapped_column(String(64), nullable=False)
    previous_secret_version: Mapped[int] = mapped_column(Integer, nullable=False)
    secret_version: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(240), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
