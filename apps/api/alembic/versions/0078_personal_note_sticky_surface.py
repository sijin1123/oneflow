"""personal note sticky surface

Revision ID: 0078
Revises: 0077
Create Date: 2026-07-12
"""

import sqlalchemy as sa

from alembic import op

revision = "0078"
down_revision = "0077"
branch_labels = None
depends_on = None

COLORS = "'lavender', 'mint', 'yellow', 'rose', 'blue', 'gray'"


def upgrade() -> None:
    op.drop_constraint("title_length", "personal_notes", type_="check")
    op.create_check_constraint(
        "title_length", "personal_notes", "char_length(title) BETWEEN 0 AND 120"
    )
    op.add_column(
        "personal_notes",
        sa.Column("color", sa.String(length=16), server_default="lavender", nullable=False),
    )
    op.create_check_constraint("color_allowed", "personal_notes", f"color IN ({COLORS})")
    op.create_index(
        "uq_personal_notes_one_blank_per_user",
        "personal_notes",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("btrim(title) = '' AND btrim(body) = ''"),
    )


def downgrade() -> None:
    op.drop_index("uq_personal_notes_one_blank_per_user", table_name="personal_notes")
    op.drop_constraint("color_allowed", "personal_notes", type_="check")
    op.drop_column("personal_notes", "color")
    op.execute("UPDATE personal_notes SET title = 'Untitled' WHERE btrim(title) = ''")
    op.drop_constraint("title_length", "personal_notes", type_="check")
    op.create_check_constraint(
        "title_length", "personal_notes", "char_length(title) BETWEEN 1 AND 120"
    )
