"""append-only Document activity history

Revision ID: 0108
Revises: 0107
Create Date: 2026-07-18
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0108"
down_revision = "0107"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_activities",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column(
            "changed_fields",
            postgresql.ARRAY(sa.String(length=24)),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind IN ('document_created', 'document_updated', "
            "'document_archived', 'document_restored')",
            name=op.f("ck_document_activities_kind_allowed"),
        ),
        sa.CheckConstraint(
            "changed_fields <@ ARRAY['title', 'body', 'parent', 'visibility', "
            "'archive_state']::varchar[]",
            name=op.f("ck_document_activities_changed_fields_allowed"),
        ),
        sa.CheckConstraint(
            "cardinality(changed_fields) <= 5",
            name=op.f("ck_document_activities_changed_fields_bounded"),
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name=op.f("fk_document_activities_actor_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["project_documents.id"],
            name=op.f("fk_document_activities_document_id_project_documents"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_document_activities")),
    )
    op.create_index(
        "ix_document_activities_document_created",
        "document_activities",
        ["document_id", "created_at", "id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_document_activities_document_created",
        table_name="document_activities",
    )
    op.drop_table("document_activities")
