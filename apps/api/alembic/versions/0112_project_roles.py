"""workspace project roles and member assignments

Revision ID: 0112
Revises: 0111
Create Date: 2026-07-18
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0112"
down_revision = "0111"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("description", sa.String(length=200), nullable=True),
        sa.Column(
            "permissions",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("revision", sa.BigInteger(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by_name", sa.String(length=120), nullable=False),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by_name", sa.String(length=120), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 50 AND name = btrim(name)",
            name=op.f("ck_project_roles_name_valid"),
        ),
        sa.CheckConstraint(
            "lower(name) NOT IN ('owner', 'member', 'viewer')",
            name=op.f("ck_project_roles_name_not_reserved"),
        ),
        sa.CheckConstraint(
            "description IS NULL OR char_length(description) BETWEEN 1 AND 200",
            name=op.f("ck_project_roles_description_valid"),
        ),
        sa.CheckConstraint(
            "jsonb_typeof(permissions) = 'array' AND jsonb_array_length(permissions) <= 7 "
            'AND permissions <@ \'["status.manage","project_type.manage",'
            '"field.manage","cycle.manage","module.manage",'
            '"automation.manage","intake.triage"]\'::jsonb',
            name=op.f("ck_project_roles_permissions_array"),
        ),
        sa.CheckConstraint("revision >= 1", name=op.f("ck_project_roles_revision_positive")),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_project_roles_archived_name", "project_roles", ["archived_at", "name"])
    op.create_index(
        "uq_project_roles_lower_name",
        "project_roles",
        [sa.text("lower(name)")],
        unique=True,
    )
    op.create_table(
        "project_role_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_name", sa.String(length=120), nullable=False),
        sa.Column("event_type", sa.String(length=20), nullable=False),
        sa.Column("revision", sa.BigInteger(), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "event_type IN ('created','updated','archived','restored')",
            name=op.f("ck_project_role_events_event_type_allowed"),
        ),
        sa.CheckConstraint(
            "jsonb_typeof(snapshot) = 'object'",
            name=op.f("ck_project_role_events_snapshot_object"),
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["role_id"], ["project_roles.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_project_role_events_role_created",
        "project_role_events",
        ["role_id", "created_at"],
    )
    op.add_column(
        "project_members",
        sa.Column("custom_role_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_project_members_custom_role_id_project_roles",
        "project_members",
        "project_roles",
        ["custom_role_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "custom_role_member_only",
        "project_members",
        "custom_role_id IS NULL OR role = 'member'",
    )
    op.create_index("ix_project_members_custom_role", "project_members", ["custom_role_id"])


def downgrade() -> None:
    op.drop_index("ix_project_members_custom_role", table_name="project_members")
    op.drop_constraint("custom_role_member_only", "project_members", type_="check")
    op.drop_constraint(
        "fk_project_members_custom_role_id_project_roles",
        "project_members",
        type_="foreignkey",
    )
    op.drop_column("project_members", "custom_role_id")
    op.drop_index("ix_project_role_events_role_created", table_name="project_role_events")
    op.drop_table("project_role_events")
    op.drop_index("uq_project_roles_lower_name", table_name="project_roles")
    op.drop_index("ix_project_roles_archived_name", table_name="project_roles")
    op.drop_table("project_roles")
