"""project cover attachment

Revision ID: 0079
Revises: 0078
Create Date: 2026-07-13
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0079"
down_revision = "0078"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("cover_attachment_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_unique_constraint(
        "uq_attachments_id_project_id",
        "attachments",
        ["id", "project_id"],
    )
    op.create_foreign_key(
        "fk_projects_cover_attachment",
        "projects",
        "attachments",
        ["cover_attachment_id", "id"],
        ["id", "project_id"],
        ondelete="SET NULL (cover_attachment_id)",
    )
    op.create_index(
        "ix_projects_cover_attachment_id",
        "projects",
        ["cover_attachment_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_projects_cover_attachment_id", table_name="projects")
    op.drop_constraint("fk_projects_cover_attachment", "projects", type_="foreignkey")
    op.drop_column("projects", "cover_attachment_id")
    op.drop_constraint("uq_attachments_id_project_id", "attachments", type_="unique")
