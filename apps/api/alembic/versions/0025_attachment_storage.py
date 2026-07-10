"""attachments.storage_key (real uploads)

Revision ID: 0025
Revises: 0024
Create Date: 2026-07-07

Purely additive: one nullable UNIQUE column. `url` stays NOT NULL — uploaded
rows carry the `oneflow://attachments/{id}` sentinel so pre-upload code (and a
rolled-back deploy) renders a dead link instead of crashing. Downgrade drops
the column; the blobs on disk are untouched (sweep manually if needed).
"""

import sqlalchemy as sa

from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("attachments", sa.Column("storage_key", sa.Text(), nullable=True))
    # DB-level guarantee that two rows can never share (and cross-delete) a blob.
    op.create_unique_constraint("uq_attachments_storage_key", "attachments", ["storage_key"])


def downgrade() -> None:
    op.drop_constraint("uq_attachments_storage_key", "attachments", type_="unique")
    op.drop_column("attachments", "storage_key")
