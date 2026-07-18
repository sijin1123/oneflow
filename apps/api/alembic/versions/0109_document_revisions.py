"""immutable Document content revisions

Revision ID: 0109
Revises: 0108
Create Date: 2026-07-18
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0109"
down_revision = "0108"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        op.f("ck_document_activities_kind_allowed"),
        "document_activities",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_document_activities_kind_allowed"),
        "document_activities",
        "kind IN ('document_created', 'document_updated', "
        "'document_archived', 'document_restored', 'document_version_restored')",
    )

    op.create_table(
        "document_revisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_version", sa.Integer(), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column(
            "changed_fields",
            postgresql.ARRAY(sa.String(length=16)),
            nullable=False,
        ),
        sa.Column("restored_from_revision_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "document_version >= 0",
            name=op.f("ck_document_revisions_document_version_nonnegative"),
        ),
        sa.CheckConstraint(
            "changed_fields <@ ARRAY['title', 'body']::varchar[] "
            "AND cardinality(changed_fields) BETWEEN 1 AND 2",
            name=op.f("ck_document_revisions_changed_fields_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name=op.f("fk_document_revisions_actor_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["project_documents.id"],
            name=op.f("fk_document_revisions_document_id_project_documents"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["restored_from_revision_id"],
            ["document_revisions.id"],
            name=op.f("fk_document_revisions_restored_from_revision_id_document_revisions"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_document_revisions")),
        sa.UniqueConstraint(
            "document_id",
            "document_version",
            name=op.f("uq_document_revisions_document_version"),
        ),
    )
    op.create_index(
        "ix_document_revisions_document_version",
        "document_revisions",
        ["document_id", "document_version", "id"],
    )

    # Existing pages receive one truthful baseline rather than fabricated history.
    op.execute(
        sa.text(
            "INSERT INTO document_revisions "
            "(id, document_id, document_version, actor_id, title, body, "
            "changed_fields, created_at) "
            "SELECT gen_random_uuid(), id, version, author_id, title, body, "
            "CASE WHEN body IS NULL THEN ARRAY['title']::varchar[] "
            "ELSE ARRAY['body', 'title']::varchar[] END, updated_at "
            "FROM project_documents"
        )
    )


def downgrade() -> None:
    op.drop_index(
        "ix_document_revisions_document_version",
        table_name="document_revisions",
    )
    op.drop_table("document_revisions")

    op.drop_constraint(
        op.f("ck_document_activities_kind_allowed"),
        "document_activities",
        type_="check",
    )
    op.execute(
        sa.text(
            "UPDATE document_activities SET kind = 'document_updated' "
            "WHERE kind = 'document_version_restored'"
        )
    )
    op.create_check_constraint(
        op.f("ck_document_activities_kind_allowed"),
        "document_activities",
        "kind IN ('document_created', 'document_updated', "
        "'document_archived', 'document_restored')",
    )
