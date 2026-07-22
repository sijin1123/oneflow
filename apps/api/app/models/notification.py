import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Notification kinds. Kept a closed set (CHECK-constrained) so the UI can render a
# known message per kind. watch_* kinds go to work-package watchers (PR-E1).
NOTIFICATION_KINDS = (
    "assigned",
    "watch_status",
    "watch_comment",
    "watch_assigned",
    "mention",
    "document_mention",
    "due_soon",
    "overdue",
    "intake_accepted",
    "intake_declined",
    "initiative_updated",
    "initiative_state",
    "initiative_health",
    "initiative_owner",
    "initiative_scope",
)


class Notification(Base):
    """Per-user inbox row (PLAN §3 Phase 2 알림).

    Written in the same transaction as the domain change that triggers it, so a
    rolled-back assignment never leaves a dangling notification."""

    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('assigned', 'watch_status', 'watch_comment', 'watch_assigned', 'mention',"
            " 'document_mention', 'due_soon', 'overdue', 'intake_accepted', 'intake_declined',"
            " 'initiative_updated', 'initiative_state', 'initiative_health',"
            " 'initiative_owner', 'initiative_scope')",
            name="notification_kind_allowed",
        ),
        CheckConstraint(
            "(kind LIKE 'initiative_%' AND initiative_id IS NOT NULL AND project_id IS NULL"
            " AND work_package_id IS NULL AND intake_item_id IS NULL AND document_id IS NULL) OR"
            " (kind = 'document_mention' AND initiative_id IS NULL AND project_id IS NOT NULL"
            " AND work_package_id IS NULL AND intake_item_id IS NULL"
            " AND document_id IS NOT NULL) OR"
            " (kind NOT LIKE 'initiative_%' AND kind <> 'document_mention'"
            " AND initiative_id IS NULL AND project_id IS NOT NULL AND document_id IS NULL)",
            name="notification_target_shape",
        ),
        CheckConstraint(
            "(actor_profile_image_storage_key IS NULL "
            "AND actor_profile_image_content_type IS NULL) OR "
            "(actor_profile_image_storage_key IS NOT NULL "
            "AND actor_profile_image_content_type IS NOT NULL)",
            name="notification_actor_image_metadata_complete",
        ),
        ForeignKeyConstraint(
            ["document_id", "project_id"],
            ["project_documents.id", "project_documents.project_id"],
            name="fk_notifications_document_same_project",
            ondelete="CASCADE",
        ),
        # Feed query: a user's notifications newest-first.
        Index("ix_notifications_user_created", "user_id", "created_at"),
        # Unread-count query.
        Index("ix_notifications_user_read", "user_id", "read"),
        Index("ix_notifications_actor_profile_image_key", "actor_profile_image_storage_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Recipient.
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True
    )
    work_package_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_packages.id", ondelete="CASCADE"), nullable=True
    )
    # Who caused it; SET NULL keeps the notification if the actor is later removed.
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_name_snapshot: Mapped[str | None] = mapped_column(String(120), nullable=True)
    actor_profile_image_storage_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    actor_profile_image_content_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    # Anchor for WP-less intake notifications (Pass 49); SET NULL degrades the
    # web route to the intake page.
    intake_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("intake_items.id", ondelete="SET NULL"), nullable=True
    )
    initiative_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("initiatives.id", ondelete="CASCADE"), nullable=True
    )
    document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    @property
    def actor_name(self) -> str | None:
        return self.actor_name_snapshot

    @property
    def actor_profile_image_url(self) -> str | None:
        if self.actor_profile_image_storage_key is None:
            return None
        version = self.actor_profile_image_storage_key.rsplit("/", 1)[-1]
        return f"/api/v1/me/notifications/{self.id}/actor-image?version={version}"
