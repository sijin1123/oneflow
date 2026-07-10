"""project_documents.parent_id (nested page hierarchy)

Revision ID: 0029
Revises: 0028
Create Date: 2026-07-07

Additive nullable column + self-referential composite same-project FK: a
cross-project parent is unrepresentable, and deleting a parent clears only the
children's parent_id (root promotion — no silent subtree deletion). Plain ALTER
is acceptable at the current pre-production scale (PLAN v9.1 R1-③); revisit
with CONCURRENTLY/NOT VALID before large-scale production.
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("project_documents", sa.Column("parent_id", UUID(as_uuid=True), nullable=True))
    op.create_unique_constraint(
        "uq_project_documents_id_project", "project_documents", ["id", "project_id"]
    )
    # PG15+ column-list SET NULL (raw SQL — same pattern as 0016 cycles).
    op.execute(
        "ALTER TABLE project_documents "
        "ADD CONSTRAINT fk_project_documents_parent_same_project "
        "FOREIGN KEY (parent_id, project_id) REFERENCES project_documents (id, project_id) "
        "ON DELETE SET NULL (parent_id)"
    )
    op.create_index("ix_project_documents_parent", "project_documents", ["parent_id"])


def downgrade() -> None:
    # DEV/CI ONLY — drops every page-hierarchy assignment.
    op.drop_index("ix_project_documents_parent", table_name="project_documents")
    op.drop_constraint(
        "fk_project_documents_parent_same_project", "project_documents", type_="foreignkey"
    )
    op.drop_constraint("uq_project_documents_id_project", "project_documents", type_="unique")
    op.drop_column("project_documents", "parent_id")
