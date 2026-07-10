"""notifications: due-date alert kinds + per-user toggle

Revision ID: 0044
Revises: 0043
Create Date: 2026-07-08

Additive. The kind CHECK is rewritten via raw SQL (0014 double-prefix trap);
`due_alerts` gates CREATION only (existing toggle semantics — flipping it off
never deletes already-delivered rows).
"""

import sqlalchemy as sa

from alembic import op

revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None

_OLD = "('assigned', 'watch_status', 'watch_comment', 'watch_assigned', 'mention')"
_NEW = (
    "('assigned', 'watch_status', 'watch_comment', 'watch_assigned', 'mention',"
    " 'due_soon', 'overdue')"
)


def upgrade() -> None:
    op.execute(
        "ALTER TABLE notifications DROP CONSTRAINT ck_notifications_notification_kind_allowed"
    )
    op.execute(
        "ALTER TABLE notifications ADD CONSTRAINT ck_notifications_notification_kind_allowed "
        f"CHECK (kind IN {_NEW})"
    )
    op.add_column(
        "user_notification_settings",
        sa.Column("due_alerts", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )


def downgrade() -> None:
    # DEV/CI ONLY — drops delivered due alerts.
    op.drop_column("user_notification_settings", "due_alerts")
    op.execute(f"DELETE FROM notifications WHERE kind NOT IN {_OLD}")
    op.execute(
        "ALTER TABLE notifications DROP CONSTRAINT ck_notifications_notification_kind_allowed"
    )
    op.execute(
        "ALTER TABLE notifications ADD CONSTRAINT ck_notifications_notification_kind_allowed "
        f"CHECK (kind IN {_OLD})"
    )
