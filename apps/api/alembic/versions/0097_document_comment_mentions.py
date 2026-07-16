"""document comment mentions and notification targets

Revision ID: 0097
Revises: 0096
Create Date: 2026-07-16
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0097"
down_revision = "0096"
branch_labels = None
depends_on = None

_KIND_CONSTRAINT = "ck_notifications_notification_kind_allowed"
_TARGET_CONSTRAINT = "ck_notifications_notification_target_shape"
_OLD_KINDS = (
    "('assigned', 'watch_status', 'watch_comment', 'watch_assigned', 'mention',"
    " 'due_soon', 'overdue', 'intake_accepted', 'intake_declined',"
    " 'initiative_updated', 'initiative_state', 'initiative_health',"
    " 'initiative_owner', 'initiative_scope')"
)
_NEW_KINDS = (
    "('assigned', 'watch_status', 'watch_comment', 'watch_assigned', 'mention',"
    " 'document_mention', 'due_soon', 'overdue', 'intake_accepted', 'intake_declined',"
    " 'initiative_updated', 'initiative_state', 'initiative_health',"
    " 'initiative_owner', 'initiative_scope')"
)


def upgrade() -> None:
    op.add_column(
        "project_document_comments",
        sa.Column("mentions", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.execute(f"ALTER TABLE notifications DROP CONSTRAINT {_TARGET_CONSTRAINT}")
    op.execute(f"ALTER TABLE notifications DROP CONSTRAINT {_KIND_CONSTRAINT}")
    op.add_column(
        "notifications",
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_notifications_document_id_project_documents",
        "notifications",
        "project_documents",
        ["document_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.execute(
        f"ALTER TABLE notifications ADD CONSTRAINT {_KIND_CONSTRAINT} CHECK (kind IN {_NEW_KINDS})"
    )
    op.execute(
        f"ALTER TABLE notifications ADD CONSTRAINT {_TARGET_CONSTRAINT} CHECK ("
        "(kind LIKE 'initiative_%' AND initiative_id IS NOT NULL AND project_id IS NULL "
        "AND work_package_id IS NULL AND intake_item_id IS NULL AND document_id IS NULL) OR "
        "(kind = 'document_mention' AND initiative_id IS NULL AND project_id IS NOT NULL "
        "AND work_package_id IS NULL AND intake_item_id IS NULL AND document_id IS NOT NULL) OR "
        "(kind NOT LIKE 'initiative_%' AND kind <> 'document_mention' "
        "AND initiative_id IS NULL AND project_id IS NOT NULL AND document_id IS NULL))"
    )


def downgrade() -> None:
    # DEV/CI ONLY: the old schema cannot represent Document notification targets.
    op.execute("DELETE FROM notifications WHERE kind = 'document_mention'")
    op.execute(f"ALTER TABLE notifications DROP CONSTRAINT {_TARGET_CONSTRAINT}")
    op.execute(f"ALTER TABLE notifications DROP CONSTRAINT {_KIND_CONSTRAINT}")
    op.execute(
        f"ALTER TABLE notifications ADD CONSTRAINT {_KIND_CONSTRAINT} CHECK (kind IN {_OLD_KINDS})"
    )
    op.drop_constraint(
        "fk_notifications_document_id_project_documents",
        "notifications",
        type_="foreignkey",
    )
    op.drop_column("notifications", "document_id")
    op.drop_column("project_document_comments", "mentions")
    op.execute(
        f"ALTER TABLE notifications ADD CONSTRAINT {_TARGET_CONSTRAINT} CHECK ("
        "(kind LIKE 'initiative_%' AND initiative_id IS NOT NULL AND project_id IS NULL "
        "AND work_package_id IS NULL AND intake_item_id IS NULL) OR "
        "(kind NOT LIKE 'initiative_%' AND initiative_id IS NULL AND project_id IS NOT NULL))"
    )
