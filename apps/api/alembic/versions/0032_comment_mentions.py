"""comment mentions: kind widen + comment.mentions + settings toggle

Revision ID: 0032
Revises: 0031
Create Date: 2026-07-07

Three additive pieces (PLAN v10.1 P10-2): the notifications.kind CHECK widens
to include 'mention' (raw SQL DROP+ADD on the canonical prefixed name — 0018
pattern; migration applies before code that inserts the new kind, and the table
is small at the current pre-production scale, R1-③); accepted mentions persist
on the comment row (JSONB list of user-id strings — the canonical mention
representation, R1-②); user_notification_settings gains the `mention` toggle
(default true, absent row = true fallback as with every other toggle).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None

_KIND_CONSTRAINT = "ck_notifications_notification_kind_allowed"
_OLD_KINDS = "('assigned', 'watch_status', 'watch_comment', 'watch_assigned')"
_NEW_KINDS = "('assigned', 'watch_status', 'watch_comment', 'watch_assigned', 'mention')"


def upgrade() -> None:
    op.execute(f"ALTER TABLE notifications DROP CONSTRAINT {_KIND_CONSTRAINT}")
    op.execute(
        f"ALTER TABLE notifications ADD CONSTRAINT {_KIND_CONSTRAINT} CHECK (kind IN {_NEW_KINDS})"
    )
    op.add_column("work_package_comments", sa.Column("mentions", JSONB(), nullable=True))
    op.add_column(
        "user_notification_settings",
        sa.Column("mention", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    # DEV/CI ONLY — would fail if mention notifications exist (never in smoke).
    op.drop_column("user_notification_settings", "mention")
    op.drop_column("work_package_comments", "mentions")
    op.execute(f"ALTER TABLE notifications DROP CONSTRAINT {_KIND_CONSTRAINT}")
    op.execute(
        f"ALTER TABLE notifications ADD CONSTRAINT {_KIND_CONSTRAINT} CHECK (kind IN {_OLD_KINDS})"
    )
