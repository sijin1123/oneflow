"""durable data transfer jobs

Revision ID: 0071
Revises: 0070
Create Date: 2026-07-11
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0071"
down_revision = "0070"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "data_transfer_jobs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=True),
        sa.Column("actor_name", sa.String(length=120), nullable=False),
        sa.Column("direction", sa.String(length=12), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("dry_run", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("total_rows", sa.Integer(), nullable=False),
        sa.Column("valid_rows", sa.Integer(), nullable=False),
        sa.Column("invalid_rows", sa.Integer(), nullable=False),
        sa.Column("inserted_rows", sa.Integer(), nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("errors", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("errors_truncated", sa.Boolean(), nullable=False),
        sa.Column("notes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("artifact_storage_key", sa.String(length=255), nullable=True),
        sa.Column("artifact_filename", sa.String(length=255), nullable=True),
        sa.Column("artifact_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("artifact_sha256", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("direction IN ('import','export')", name="direction_allowed"),
        sa.CheckConstraint("source IN ('oneflow','jira','linear')", name="source_allowed"),
        sa.CheckConstraint(
            "status IN ('completed','completed_with_errors')", name="status_allowed"
        ),
        sa.CheckConstraint(
            "total_rows >= 0 AND valid_rows >= 0 AND invalid_rows >= 0 "
            "AND inserted_rows >= 0 AND inserted_rows <= valid_rows",
            name="counts_valid",
        ),
        sa.CheckConstraint("char_length(checksum) = 64", name="checksum_sha256"),
        sa.CheckConstraint("jsonb_typeof(errors) = 'array'", name="errors_array"),
        sa.CheckConstraint("jsonb_typeof(notes) = 'array'", name="notes_array"),
        sa.CheckConstraint(
            "(direction = 'export' AND source = 'oneflow' AND dry_run = false "
            "AND artifact_storage_key IS NOT NULL AND artifact_filename IS NOT NULL "
            "AND artifact_size_bytes IS NOT NULL AND artifact_size_bytes >= 0 "
            "AND artifact_sha256 IS NOT NULL AND char_length(artifact_sha256) = 64) OR "
            "(direction = 'import' AND artifact_storage_key IS NULL "
            "AND artifact_filename IS NULL AND artifact_size_bytes IS NULL "
            "AND artifact_sha256 IS NULL)",
            name="artifact_shape",
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("artifact_storage_key", name="artifact_storage_key_unique"),
    )
    op.create_index(
        "ix_data_transfer_jobs_project_created",
        "data_transfer_jobs",
        ["project_id", sa.text("created_at DESC"), sa.text("id DESC")],
    )
    op.create_index(
        "ix_data_transfer_jobs_actor_created",
        "data_transfer_jobs",
        ["actor_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_data_transfer_jobs_actor_created", table_name="data_transfer_jobs")
    op.drop_index("ix_data_transfer_jobs_project_created", table_name="data_transfer_jobs")
    op.drop_table("data_transfer_jobs")
