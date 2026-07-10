"""Plain-text snippet extraction for content search (Pass 39 PR-BE).

The DB matches against the RAW stored value (HTML for documents/meetings);
the snippet is extracted from a tag-stripped plain text. When the query only
matched markup (tag names, attributes, entities), the plain text won't
contain it — the snippet is None and the item still returns as a content
match (v39.1 R1-④, recorded limitation)."""

import html
import re

_TAG_RE = re.compile(r"<[^>]*>")
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_WS_RE = re.compile(r"\s+")
RADIUS = 60
MAX_SNIPPET = (RADIUS * 2) + 40


def strip_tags(value: str) -> str:
    """Markup → readable plain text (NOT a sanitizer — display excerpts only)."""
    unescaped = html.unescape(_TAG_RE.sub(" ", value))
    cleaned = _CONTROL_RE.sub("", unescaped)
    return _WS_RE.sub(" ", cleaned).strip()


def extract_snippet(value: str, q: str, radius: int = RADIUS) -> str | None:
    """±radius chars around the first case-insensitive match in the
    tag-stripped text, with ellipses on cut edges; None when the match only
    existed in markup."""
    plain = strip_tags(value)
    pos = plain.lower().find(q.lower())
    if pos < 0:
        return None
    start = max(0, pos - radius)
    end = min(len(plain), pos + len(q) + radius)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(plain) else ""
    snippet = f"{prefix}{plain[start:end]}{suffix}"
    return snippet[:MAX_SNIPPET]
