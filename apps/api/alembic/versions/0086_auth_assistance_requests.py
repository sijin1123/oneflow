"""Add durable authentication assistance requests.

Revision ID: 0086
Revises: 0085
Create Date: 2026-07-15
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0086"
down_revision = "0085"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_assistance_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("submission_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "last_submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("triage_note", sa.Text(), nullable=True),
        sa.Column("triaged_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("triaged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("redacted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "kind IN ('sign_in_help', 'workspace_access')",
            name="kind_allowed",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'in_review', 'resolved', 'rejected')",
            name="status_allowed",
        ),
        sa.CheckConstraint(
            "submission_count >= 1",
            name="submission_count_positive",
        ),
        sa.CheckConstraint("version >= 1", name="version_positive"),
        sa.CheckConstraint(
            "status NOT IN ('pending', 'in_review') OR email IS NOT NULL",
            name="open_email_required",
        ),
        sa.ForeignKeyConstraint(
            ["triaged_by"],
            ["users.id"],
            name="fk_auth_assistance_requests_triaged_by_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_auth_assistance_requests"),
    )
    op.create_index(
        "ix_auth_assistance_status_created",
        "auth_assistance_requests",
        ["status", "created_at"],
    )
    op.create_index(
        "uq_auth_assistance_open_kind_email",
        "auth_assistance_requests",
        ["kind", "email"],
        unique=True,
        postgresql_where=sa.text("status IN ('pending', 'in_review')"),
    )
    op.create_table(
        "auth_assistance_rate_limits",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column(
            "window_started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("id = 1", name="singleton"),
        sa.CheckConstraint("attempt_count >= 0", name="attempt_count_nonnegative"),
        sa.PrimaryKeyConstraint("id", name="pk_auth_assistance_rate_limits"),
    )
    op.execute(
        "INSERT INTO auth_assistance_rate_limits "
        "(id, window_started_at, attempt_count) VALUES (1, now(), 0)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS auth_assistance_rate_limits")
    op.drop_index("uq_auth_assistance_open_kind_email", table_name="auth_assistance_requests")
    op.drop_index("ix_auth_assistance_status_created", table_name="auth_assistance_requests")
    op.drop_table("auth_assistance_requests")
