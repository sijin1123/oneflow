"""work_package_comments.parent_id (single-level threaded replies)

Revision ID: 0031
Revises: 0030
Create Date: 2026-07-07

Additive nullable column + self-referential composite same-WP FK: a reply on a
different work package is unrepresentable, and deleting a root promotes its
replies (SET NULL — comments are audit-like, no silent thread loss; PLAN v10.1
R1-⑤). The single-level invariant (a reply's parent must itself be a root) is
API-enforced at the create_comment single entry point — the DB cannot express
it without a trigger, which stays outside the house patterns (R1-④).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "work_package_comments", sa.Column("parent_id", UUID(as_uuid=True), nullable=True)
    )
    op.create_unique_constraint(
        "uq_comments_id_wp", "work_package_comments", ["id", "work_package_id"]
    )
    # PG15+ column-list SET NULL (raw SQL — 0016/0029 pattern).
    op.execute(
        "ALTER TABLE work_package_comments "
        "ADD CONSTRAINT fk_comments_parent_same_wp "
        "FOREIGN KEY (parent_id, work_package_id) "
        "REFERENCES work_package_comments (id, work_package_id) "
        "ON DELETE SET NULL (parent_id)"
    )
    op.create_index("ix_comments_parent", "work_package_comments", ["parent_id"])


def downgrade() -> None:
    # DEV/CI ONLY — drops every reply-thread assignment.
    op.drop_index("ix_comments_parent", table_name="work_package_comments")
    op.drop_constraint("fk_comments_parent_same_wp", "work_package_comments", type_="foreignkey")
    op.drop_constraint("uq_comments_id_wp", "work_package_comments", type_="unique")
    op.drop_column("work_package_comments", "parent_id")
