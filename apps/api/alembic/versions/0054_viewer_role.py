"""project_members: viewer role

Revision ID: 0054
Revises: 0053
Create Date: 2026-07-08

Additive vocabulary (raw-SQL CHECK rewrite — 0032 precedent). A viewer is a
FULL member for reads (trusted internal user, not a guest — v61.1 R1-①) and
is rejected with 403 on every project write; existing references (assignee/
watcher/values) survive a demotion (the Pass-33 preservation policy) — only
NEW assignments are blocked.
"""

from alembic import op

revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None

_CONSTRAINT = "ck_project_members_role_allowed"


def upgrade() -> None:
    op.execute(f"ALTER TABLE project_members DROP CONSTRAINT {_CONSTRAINT}")
    op.execute(
        f"ALTER TABLE project_members ADD CONSTRAINT {_CONSTRAINT} "
        "CHECK (role IN ('owner', 'member', 'viewer'))"
    )


def downgrade() -> None:
    # DEV/CI ONLY — viewers fold back to members before the CHECK narrows.
    op.execute("UPDATE project_members SET role = 'member' WHERE role = 'viewer'")
    op.execute(f"ALTER TABLE project_members DROP CONSTRAINT {_CONSTRAINT}")
    op.execute(
        f"ALTER TABLE project_members ADD CONSTRAINT {_CONSTRAINT} "
        "CHECK (role IN ('owner', 'member'))"
    )
