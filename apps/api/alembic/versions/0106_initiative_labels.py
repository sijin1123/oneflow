"""initiative labels taxonomy

Revision ID: 0106
Revises: 0105
Create Date: 2026-07-18
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0106"
down_revision = "0105"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "initiative_labels",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("color", sa.String(length=7), server_default="#64748b", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("color ~ '^#[0-9a-f]{6}$'", name="color_hex"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_initiative_labels_name_lower",
        "initiative_labels",
        [sa.text("lower(name)")],
        unique=True,
    )
    op.create_table(
        "initiative_label_assignments",
        sa.Column("initiative_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("label_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["initiative_id"], ["initiatives.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["label_id"], ["initiative_labels.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("initiative_id", "label_id"),
    )
    op.create_index(
        "ix_initiative_label_assignments_label",
        "initiative_label_assignments",
        ["label_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_initiative_label_assignments_label", table_name="initiative_label_assignments"
    )
    op.drop_table("initiative_label_assignments")
    op.drop_index("uq_initiative_labels_name_lower", table_name="initiative_labels")
    op.drop_table("initiative_labels")
