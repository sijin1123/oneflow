"""meetings: follow_up_source_id

Revision ID: 0058
Revises: 0057
Create Date: 2026-07-08

Manual follow-up tracking (Pass 79). follow_up_source_id points at the
IMMEDIATE parent meeting a follow-up was created from — distinct from
recurrence_source_id (Pass 69, sweep-generated occurrences). SET NULL so
deleting the source leaves the follow-up standing (shown as '원본 삭제됨').
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0058"
down_revision = "0057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column(
            "follow_up_source_id",
            UUID(as_uuid=True),
            sa.ForeignKey("meetings.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_meetings_follow_up_source", "meetings", ["follow_up_source_id"])


def downgrade() -> None:
    op.drop_index("ix_meetings_follow_up_source", table_name="meetings")
    op.drop_column("meetings", "follow_up_source_id")
