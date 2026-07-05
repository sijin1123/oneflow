"""initial schema: users, projects, project_members, work_packages, work_package_relations

Revision ID: 0001
Revises:
Create Date: 2026-07-04

Clean-room note: this schema is authored from docs/ONEFLOW_PLAN.md §7 — no
reference-product schema files were consulted or copied.
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )

    op.create_table(
        "projects",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(10), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("key", name="uq_projects_key"),
    )

    op.create_table(
        "project_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_members_project_user"),
        sa.CheckConstraint("role IN ('owner', 'member')", name="ck_project_members_role_allowed"),
    )

    op.create_table(
        "work_packages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("priority", sa.String(20), nullable=False),
        sa.Column("assignee_id", UUID(as_uuid=True), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("parent_id", UUID(as_uuid=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assignee_id"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            "type IN ('task', 'bug', 'feature', 'milestone')", name="ck_work_packages_type_allowed"
        ),
        sa.CheckConstraint(
            "status IN ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled')",
            name="ck_work_packages_status_allowed",
        ),
        sa.CheckConstraint(
            "priority IN ('none', 'low', 'medium', 'high', 'urgent')",
            name="ck_work_packages_priority_allowed",
        ),
        sa.CheckConstraint("parent_id <> id", name="ck_work_packages_parent_not_self"),
        # Composite-FK anchor (also serves as the referenced index — PLAN §7).
        sa.UniqueConstraint("id", "project_id", name="uq_work_packages_id_project"),
    )
    # Cross-project parent unrepresentable: composite self-FK with PG15+ column-list SET NULL.
    op.create_foreign_key(
        "fk_work_packages_parent_same_project",
        "work_packages",
        "work_packages",
        ["parent_id", "project_id"],
        ["id", "project_id"],
        ondelete="SET NULL (parent_id)",
    )
    op.create_index("ix_work_packages_project_status", "work_packages", ["project_id", "status"])
    op.create_index(
        "ix_work_packages_project_updated_desc",
        "work_packages",
        ["project_id", sa.text("updated_at DESC")],
    )
    op.create_index("ix_work_packages_parent", "work_packages", ["parent_id"])
    op.create_index("ix_work_packages_assignee", "work_packages", ["assignee_id"])

    op.create_table(
        "work_package_relations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("source_id", UUID(as_uuid=True), nullable=False),
        sa.Column("target_id", UUID(as_uuid=True), nullable=False),
        sa.Column("relation_type", sa.String(20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint(
            "source_id", "target_id", "relation_type", name="uq_relations_source_target_type"
        ),
        sa.CheckConstraint("source_id <> target_id", name="ck_work_package_relations_not_self"),
        sa.CheckConstraint(
            "relation_type IN ('blocks', 'precedes', 'follows', 'relates')",
            name="ck_work_package_relations_relation_type_allowed",
        ),
        # Same-project invariant, DB-enforced from 0001 (PLAN §6.1/§7).
        sa.ForeignKeyConstraint(
            ["source_id", "project_id"],
            ["work_packages.id", "work_packages.project_id"],
            name="fk_relations_source_same_project",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["target_id", "project_id"],
            ["work_packages.id", "work_packages.project_id"],
            name="fk_relations_target_same_project",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_relations_source", "work_package_relations", ["source_id"])
    op.create_index("ix_relations_target", "work_package_relations", ["target_id"])


def downgrade() -> None:
    # Local/test-DB schema reversibility only — shared environments are forward-only (§11).
    op.drop_table("work_package_relations")
    op.drop_index("ix_work_packages_assignee", table_name="work_packages")
    op.drop_index("ix_work_packages_parent", table_name="work_packages")
    op.drop_index("ix_work_packages_project_updated_desc", table_name="work_packages")
    op.drop_index("ix_work_packages_project_status", table_name="work_packages")
    op.drop_table("work_packages")
    op.drop_table("project_members")
    op.drop_table("projects")
    op.drop_table("users")
