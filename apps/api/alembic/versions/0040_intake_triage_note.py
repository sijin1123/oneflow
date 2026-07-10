"""intake_items: triage note + decision audit

Revision ID: 0040
Revises: 0039
Create Date: 2026-07-08

Additive: the FINAL-decision metadata (v29.1 R1-⑥ — not an append-only log).
Every triage UPDATE replaces the note (null when omitted), so a snooze reason
never lingers on the final decision; triaged_by survives user deletion via
SET NULL (created_by precedent).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("intake_items", sa.Column("triage_note", sa.Text(), nullable=True))
    op.add_column("intake_items", sa.Column("triaged_by", UUID(as_uuid=True), nullable=True))
    op.add_column(
        "intake_items", sa.Column("triaged_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_intake_items_triaged_by_users",
        "intake_items",
        "users",
        ["triaged_by"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # DEV/CI ONLY — drops triage audit data.
    op.drop_constraint("fk_intake_items_triaged_by_users", "intake_items", type_="foreignkey")
    op.drop_column("intake_items", "triaged_at")
    op.drop_column("intake_items", "triaged_by")
    op.drop_column("intake_items", "triage_note")
