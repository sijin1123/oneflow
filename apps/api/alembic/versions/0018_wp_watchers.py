"""wp_watchers + widened notification kinds

Revision ID: 0018
Revises: 0017
Create Date: 2026-07-06

Additive (new table) plus a CHECK widen on notifications.kind — both safe under
the forward-only production posture. The downgrade narrows the CHECK back and
would FAIL if watch_* notifications exist; it is for the dev/CI migrate smoke
only (which never inserts data).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None

_KIND_CONSTRAINT = "ck_notifications_notification_kind_allowed"
_OLD_KINDS = "('assigned')"
_NEW_KINDS = "('assigned', 'watch_status', 'watch_comment', 'watch_assigned')"


def upgrade() -> None:
    op.create_table(
        "wp_watchers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("work_package_id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["work_package_id"], ["work_packages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("work_package_id", "user_id", name="uq_wp_watchers_wp_user"),
    )
    op.create_index("ix_wp_watchers_user", "wp_watchers", ["user_id"])

    # Widen the closed kind set for watcher notifications (canonical name, 0014).
    op.execute(f"ALTER TABLE notifications DROP CONSTRAINT {_KIND_CONSTRAINT}")
    op.execute(
        f"ALTER TABLE notifications ADD CONSTRAINT {_KIND_CONSTRAINT} CHECK (kind IN {_NEW_KINDS})"
    )


def downgrade() -> None:
    op.execute(f"ALTER TABLE notifications DROP CONSTRAINT {_KIND_CONSTRAINT}")
    op.execute(
        f"ALTER TABLE notifications ADD CONSTRAINT {_KIND_CONSTRAINT} CHECK (kind IN {_OLD_KINDS})"
    )
    op.drop_index("ix_wp_watchers_user", table_name="wp_watchers")
    op.drop_table("wp_watchers")
