"""module_members

Revision ID: 0055
Revises: 0054
Create Date: 2026-07-08

Module participant roster (Pass 65, v65.1). A LIVING current grouping — not
history: reads filter rows to currently-eligible users (active AND project
member AND role != viewer), so the table itself is additive and dumb. The
composite (module_id, project_id) FK reuses uq_modules_id_project — a row can
never point at another project's module. Rows die with the module or the
user (CASCADE both ways).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0055"
down_revision = "0054"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "module_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("module_id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["module_id", "project_id"],
            ["modules.id", "modules.project_id"],
            name="fk_module_members_module_project",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("module_id", "user_id", name="uq_module_members_module_user"),
    )
    op.create_index("ix_module_members_module", "module_members", ["module_id"])


def downgrade() -> None:
    # DEV/CI ONLY — drops every roster row.
    op.drop_index("ix_module_members_module", table_name="module_members")
    op.drop_table("module_members")
