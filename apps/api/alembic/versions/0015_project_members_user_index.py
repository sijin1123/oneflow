"""index project_members.user_id (hot auth-path lookup)

Revision ID: 0015
Revises: 0014
Create Date: 2026-07-06

The unique constraint on (project_id, user_id) does not serve a user_id-only
predicate, yet `select ProjectMember.project_id where user_id = :me` runs on every
project list and cross-project search (and on a future user-delete cascade). Add a
matching index so that lookup is not a sequential scan (fable5 audit, DB #3).
"""

from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_project_members_user", "project_members", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_project_members_user", table_name="project_members")
