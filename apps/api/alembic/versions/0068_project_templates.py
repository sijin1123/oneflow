"""immutable project templates

Revision ID: 0068
Revises: 0067
Create Date: 2026-07-11
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0068"
down_revision = "0067"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_templates",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source_project_id", sa.UUID(), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.CheckConstraint("char_length(name) BETWEEN 1 AND 120", name="name_length"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_project_templates_active_name",
        "project_templates",
        ["name"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_project_templates_source_project", "project_templates", ["source_project_id"]
    )
    op.create_table(
        "project_template_revisions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("template_id", sa.UUID(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("version >= 1", name="version_positive"),
        sa.CheckConstraint("jsonb_typeof(snapshot) = 'object'", name="snapshot_object"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["template_id"], ["project_templates.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("template_id", "id", name="uq_project_template_revision_identity"),
        sa.UniqueConstraint("template_id", "version", name="uq_project_template_revision_version"),
    )
    op.create_index(
        "ix_project_template_revisions_template",
        "project_template_revisions",
        ["template_id", "version"],
    )
    op.execute(
        """
        CREATE FUNCTION prevent_project_template_revision_mutation() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'project template revisions are immutable';
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER project_template_revisions_immutable
        BEFORE UPDATE OR DELETE ON project_template_revisions
        FOR EACH ROW EXECUTE FUNCTION prevent_project_template_revision_mutation()
        """
    )
    op.create_table(
        "project_template_applications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("template_id", sa.UUID(), nullable=False),
        sa.Column("revision_id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("applied_by", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["applied_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["template_id", "revision_id"],
            ["project_template_revisions.template_id", "project_template_revisions.id"],
            name="fk_project_template_application_revision_identity",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["template_id"], ["project_templates.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_project_template_applications_template_created",
        "project_template_applications",
        ["template_id", "created_at"],
    )
    op.create_index(
        "ix_project_template_applications_project_created",
        "project_template_applications",
        ["project_id", "created_at"],
    )
    op.create_table(
        "project_template_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("template_id", sa.UUID(), nullable=False),
        sa.Column("revision_id", sa.UUID(), nullable=True),
        sa.Column("actor_id", sa.UUID(), nullable=True),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "event_type IN ('created','revision_created','archived','unarchived','deleted')",
            name="event_type_allowed",
        ),
        sa.CheckConstraint(
            "(event_type IN ('created','revision_created') AND revision_id IS NOT NULL) OR "
            "(event_type IN ('archived','unarchived','deleted') AND revision_id IS NULL)",
            name="event_revision_shape",
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["template_id"], ["project_templates.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["template_id", "revision_id"],
            ["project_template_revisions.template_id", "project_template_revisions.id"],
            name="fk_project_template_event_revision_identity",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_project_template_events_template_created",
        "project_template_events",
        ["template_id", "created_at"],
    )


def downgrade() -> None:
    # IF EXISTS keeps local development recoverable when an earlier in-progress
    # 0068 revision was applied before lifecycle events were introduced.
    op.execute("DROP TABLE IF EXISTS project_template_events")
    op.drop_index(
        "ix_project_template_applications_project_created",
        table_name="project_template_applications",
    )
    op.drop_index(
        "ix_project_template_applications_template_created",
        table_name="project_template_applications",
    )
    op.drop_table("project_template_applications")
    op.execute(
        "DROP TRIGGER IF EXISTS project_template_revisions_immutable ON project_template_revisions"
    )
    op.execute("DROP FUNCTION IF EXISTS prevent_project_template_revision_mutation()")
    op.drop_index("ix_project_template_revisions_template", table_name="project_template_revisions")
    op.drop_table("project_template_revisions")
    op.drop_index("ix_project_templates_source_project", table_name="project_templates")
    op.drop_index("uq_project_templates_active_name", table_name="project_templates")
    op.drop_table("project_templates")
