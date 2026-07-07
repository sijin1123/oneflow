"""dashboard_layouts (per-user widget layout)

Revision ID: 0038
Revises: 0037
Create Date: 2026-07-07

Personal display preference — PK(project_id, user_id), CASCADE both ways.
Invariant split (PLAN v18.1 R1-②): the DB CHECK holds the vocabulary and the
non-empty minimum; de-duplication/ordering normalization is the API's job.
Widget add/remove later = rewrite this CHECK (raw SQL, 0018 pattern) and clean
existing rows in the same migration.
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None

_VOCAB = (
    '["summary", "budget", "progress", "status_distribution", '
    '"priority_distribution", "recent_activity"]'
)
_CHECK = (
    "jsonb_typeof(widgets) = 'array' "
    "AND jsonb_array_length(widgets) >= 1 "
    f"AND widgets <@ '{_VOCAB}'::jsonb"
)


def upgrade() -> None:
    op.create_table(
        "dashboard_layouts",
        sa.Column("project_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("widgets", JSONB(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        # Short name — the naming convention adds the ck_dashboard_layouts_ prefix.
        sa.CheckConstraint(_CHECK, name="widgets_valid"),
    )


def downgrade() -> None:
    # DEV/CI ONLY — drops every saved layout.
    op.drop_table("dashboard_layouts")
