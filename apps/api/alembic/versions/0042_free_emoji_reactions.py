"""comment_reactions: free emoji (glyphs replace the closed key set)

Revision ID: 0042
Revises: 0041
Create Date: 2026-07-08

Order matters and runs in ONE transaction (v35.1 R1-⑤):
  1. drop the closed-vocabulary CHECK (the six keys),
  2. rewrite legacy keys to their glyphs (injective — no unique conflicts;
     idempotent — re-running matches nothing),
  3. add the shape CHECK, which every remaining row now satisfies.

The shape CHECK is a coarse backstop (length, at least one non-ASCII
codepoint, no whitespace/control); the full single-grapheme grammar lives in
app.services.emoji — the PUT endpoint is the only writer (R1-②).
"""

from alembic import op

revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None

_LEGACY = {
    "thumbs_up": "👍",
    "thumbs_down": "👎",
    "tada": "🎉",
    "heart": "❤️",
    "smile": "😄",
    "confused": "😕",
}


def upgrade() -> None:
    # Raw SQL: op.drop_constraint would re-apply the naming convention and
    # double the ck_ prefix (the 0014 trap).
    op.execute("ALTER TABLE comment_reactions DROP CONSTRAINT ck_comment_reactions_emoji_allowed")
    for key, glyph in _LEGACY.items():
        op.execute(f"UPDATE comment_reactions SET emoji = '{glyph}' WHERE emoji = '{key}'")
    op.create_check_constraint(
        "emoji_shape",
        "comment_reactions",
        "char_length(emoji) BETWEEN 1 AND 16"
        " AND emoji ~ '[^\\x01-\\x7F]'"
        " AND emoji !~ '[[:space:][:cntrl:]]'",
    )


def downgrade() -> None:
    # DEV/CI ONLY — free emoji outside the legacy six are DROPPED.
    op.execute("ALTER TABLE comment_reactions DROP CONSTRAINT ck_comment_reactions_emoji_shape")
    for key, glyph in _LEGACY.items():
        op.execute(f"UPDATE comment_reactions SET emoji = '{key}' WHERE emoji = '{glyph}'")
    op.execute(
        "DELETE FROM comment_reactions WHERE emoji NOT IN "
        "('thumbs_up', 'thumbs_down', 'tada', 'heart', 'smile', 'confused')"
    )
    op.create_check_constraint(
        "emoji_allowed",
        "comment_reactions",
        "emoji IN ('thumbs_up', 'thumbs_down', 'tada', 'heart', 'smile', 'confused')",
    )
