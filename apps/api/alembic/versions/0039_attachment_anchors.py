"""attachments: work-package / document anchors

Revision ID: 0039
Revises: 0038
Create Date: 2026-07-07

Additive nullable anchor columns with composite same-project FKs. Both FKs
REUSE the existing (id, project_id) uniques — uq_work_packages_id_project
(0001) and uq_project_documents_id_project (0029); never create new ones
(v23.1 R1-③). PG15+ column-list SET NULL: deleting the anchor PRESERVES the
file as a plain project attachment (data-preservation ruling, R1-①). The CHECK
allows at most ONE anchor.
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("attachments", sa.Column("work_package_id", UUID(as_uuid=True), nullable=True))
    op.add_column("attachments", sa.Column("document_id", UUID(as_uuid=True), nullable=True))
    op.execute(
        "ALTER TABLE attachments "
        "ADD CONSTRAINT fk_attachments_wp_same_project "
        "FOREIGN KEY (work_package_id, project_id) "
        "REFERENCES work_packages (id, project_id) ON DELETE SET NULL (work_package_id)"
    )
    op.execute(
        "ALTER TABLE attachments "
        "ADD CONSTRAINT fk_attachments_document_same_project "
        "FOREIGN KEY (document_id, project_id) "
        "REFERENCES project_documents (id, project_id) ON DELETE SET NULL (document_id)"
    )
    # Short name — the convention adds the ck_attachments_ prefix.
    op.create_check_constraint(
        "single_anchor",
        "attachments",
        "NOT (work_package_id IS NOT NULL AND document_id IS NOT NULL)",
    )
    op.create_index("ix_attachments_wp", "attachments", ["work_package_id"])
    op.create_index("ix_attachments_document", "attachments", ["document_id"])


def downgrade() -> None:
    # DEV/CI ONLY — drops every anchor assignment.
    op.drop_index("ix_attachments_document", table_name="attachments")
    op.drop_index("ix_attachments_wp", table_name="attachments")
    op.execute("ALTER TABLE attachments DROP CONSTRAINT ck_attachments_single_anchor")
    op.drop_constraint("fk_attachments_document_same_project", "attachments", type_="foreignkey")
    op.drop_constraint("fk_attachments_wp_same_project", "attachments", type_="foreignkey")
    op.drop_column("attachments", "document_id")
    op.drop_column("attachments", "work_package_id")
