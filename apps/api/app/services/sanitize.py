"""Server-side HTML sanitization for rich-text fields (PLAN §3 Phase 1 후속 Tiptap).

The server is the authoritative XSS boundary: any HTML that reaches a rich-text
column is cleaned here on write, so a crafted payload that bypasses the client
editor still cannot store a script/handler. The allowlist matches what the Tiptap
StarterKit editor can produce.
"""

import nh3

ALLOWED_TAGS = {
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "h1",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "a",
    "hr",
}
ALLOWED_ATTRIBUTES = {"a": {"href", "title"}}
# Only safe link schemes — javascript:/data: are rejected.
ALLOWED_SCHEMES = {"http", "https", "mailto"}


def sanitize_html(value: str | None) -> str | None:
    """Clean rich-text HTML to the allowlist; None passes through unchanged."""
    if value is None:
        return None
    return nh3.clean(
        value,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes=ALLOWED_SCHEMES,
    )
