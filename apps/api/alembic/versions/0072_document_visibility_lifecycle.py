"""document visibility and archive lifecycle

Revision ID: 0072
Revises: 0071
Create Date: 2026-07-11
"""

import sqlalchemy as sa

from alembic import op

revision = "0072"
down_revision = "0071"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "project_documents",
        sa.Column("visibility", sa.String(length=12), server_default="shared", nullable=False),
    )
    op.add_column(
        "project_documents", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("project_documents", sa.Column("archived_by_user_id", sa.UUID(), nullable=True))
    op.add_column(
        "project_documents", sa.Column("archived_by_name", sa.String(length=120), nullable=True)
    )
    op.create_foreign_key(
        "fk_project_documents_archived_by_user",
        "project_documents",
        "users",
        ["archived_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "visibility_allowed",
        "project_documents",
        "visibility IN ('shared','private')",
    )
    op.create_check_constraint(
        "archive_audit_shape",
        "project_documents",
        "(archived_at IS NULL AND archived_by_user_id IS NULL AND archived_by_name IS NULL) OR "
        "(archived_at IS NOT NULL AND archived_by_name IS NOT NULL)",
    )
    op.create_index(
        "ix_project_documents_project_visibility_archive",
        "project_documents",
        ["project_id", "visibility", "archived_at", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_project_documents_project_visibility_archive", table_name="project_documents")
    op.drop_constraint("archive_audit_shape", "project_documents", type_="check")
    op.drop_constraint("visibility_allowed", "project_documents", type_="check")
    op.drop_constraint(
        "fk_project_documents_archived_by_user", "project_documents", type_="foreignkey"
    )
    op.drop_column("project_documents", "archived_by_name")
    op.drop_column("project_documents", "archived_by_user_id")
    op.drop_column("project_documents", "archived_at")
    op.drop_column("project_documents", "visibility")
