"""meetings: recurrence presets + source anchor

Revision ID: 0056
Revises: 0055
Create Date: 2026-07-08

Recurring meetings (Pass 69, v69.1). recurrence is a three-preset vocabulary
on the CHAIN TAIL only (the sweep hands it to each new occurrence and clears
the source — one active tail per chain). recurrence_source_id anchors a
sweep-generated occurrence to its origin: idempotency probes use this id,
never title+date heuristics (R1-①). The partial index serves the sweep's
candidate scan (R1-⑥).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0056"
down_revision = "0055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meetings", sa.Column("recurrence", sa.String(10), nullable=True))
    op.add_column(
        "meetings",
        sa.Column(
            "recurrence_source_id",
            UUID(as_uuid=True),
            sa.ForeignKey("meetings.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.execute(
        "ALTER TABLE meetings ADD CONSTRAINT ck_meetings_recurrence_allowed "
        "CHECK (recurrence IN ('weekly', 'biweekly', 'monthly'))"
    )
    op.execute(
        "CREATE INDEX ix_meetings_recurrence ON meetings (scheduled_on) "
        "WHERE recurrence IS NOT NULL"
    )


def downgrade() -> None:
    # DEV/CI ONLY.
    op.execute("DROP INDEX ix_meetings_recurrence")
    op.execute("ALTER TABLE meetings DROP CONSTRAINT ck_meetings_recurrence_allowed")
    op.drop_column("meetings", "recurrence_source_id")
    op.drop_column("meetings", "recurrence")
