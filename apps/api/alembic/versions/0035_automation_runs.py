"""automation_rule_runs (per-WP execution log)

Revision ID: 0035
Revises: 0034
Create Date: 2026-07-07

Audit log for automation writes (PLAN v16.1). Rule and work-package references
are SET NULL with readable snapshots (rule_name / work_package_subject) so the
log survives deletes; project delete removes everything (existing whole-project
CASCADE policy — R1-①). Rows insert in the SAME transaction as the change the
rule applied, alongside the fired_count update.
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "automation_rule_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("rule_id", UUID(as_uuid=True), nullable=True),
        sa.Column("rule_name", sa.String(80), nullable=False),
        sa.Column("work_package_id", UUID(as_uuid=True), nullable=True),
        sa.Column("work_package_subject", sa.String(255), nullable=False),
        sa.Column("field", sa.String(30), nullable=False),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("actor_id", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["rule_id"], ["automation_rules.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["work_package_id"], ["work_packages.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_rule_runs_project_created", "automation_rule_runs", ["project_id", "created_at"]
    )
    op.create_index("ix_rule_runs_wp", "automation_rule_runs", ["work_package_id"])
    op.create_index("ix_rule_runs_rule", "automation_rule_runs", ["rule_id"])


def downgrade() -> None:
    # DEV/CI ONLY — drops the automation audit log.
    op.drop_index("ix_rule_runs_rule", table_name="automation_rule_runs")
    op.drop_index("ix_rule_runs_wp", table_name="automation_rule_runs")
    op.drop_index("ix_rule_runs_project_created", table_name="automation_rule_runs")
    op.drop_table("automation_rule_runs")
