"""document_work_package_links (page ↔ work-package association)

Revision ID: 0030
Revises: 0029
Create Date: 2026-07-07

A link is an association fact, not an owned resource: both sides CASCADE on
delete. Both FKs are composite same-project references (relations 0001 / cycles
0016 pattern), so a cross-project link is unrepresentable even for writes that
bypass the API. ix_document_wp_links_wp serves the reverse lookup
(GET /work-packages/{id}/documents — PLAN v9.1 R1-⑦).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_work_package_links",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", UUID(as_uuid=True), nullable=False),
        sa.Column("work_package_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["document_id", "project_id"],
            ["project_documents.id", "project_documents.project_id"],
            name="fk_document_wp_links_document_same_project",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["work_package_id", "project_id"],
            ["work_packages.id", "work_packages.project_id"],
            name="fk_document_wp_links_wp_same_project",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("document_id", "work_package_id", name="uq_document_wp_links_doc_wp"),
    )
    op.create_index("ix_document_wp_links_wp", "document_work_package_links", ["work_package_id"])


def downgrade() -> None:
    # DEV/CI ONLY — drops every page↔work-package association.
    op.drop_index("ix_document_wp_links_wp", table_name="document_work_package_links")
    op.drop_table("document_work_package_links")
