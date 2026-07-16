"""Server-side HTML sanitization for rich-text fields (PLAN §3 Phase 1 후속 Tiptap).

The server is the authoritative XSS boundary: any HTML that reaches a rich-text
column is cleaned here on write, so a crafted payload that bypasses the client
editor still cannot store a script/handler. The allowlist matches what the Tiptap
StarterKit editor can produce.
"""

import re
import uuid
from html.parser import HTMLParser

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


# Document-only vocabulary (Pass 68): img is allowed ONLY through the document
# pipeline — every other rich-text surface (meetings, …) keeps the base list.
DOCUMENT_TAGS = ALLOWED_TAGS | {"img", "span"}
DOCUMENT_ATTRIBUTES = {
    **ALLOWED_ATTRIBUTES,
    "img": {"src", "alt"},
    "span": {"data-comment-anchor"},
}


def sanitize_document_html(value: str | None) -> str | None:
    """Document-body sanitize: base allowlist plus images and comment anchors.

    Image src remains subject to validate_inline_images(). A comment anchor is
    inert metadata only; the inline-comment write path validates its UUID and
    exact visible quote before persistence.
    """
    if value is None:
        return None
    return nh3.clean(
        value,
        tags=DOCUMENT_TAGS,
        attributes=DOCUMENT_ATTRIBUTES,
        url_schemes=ALLOWED_SCHEMES,
    )


def normalize_anchor_quote(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


class _CommentAnchorParser(HTMLParser):
    _VOID_TAGS = {"br", "hr", "img"}

    def __init__(self, anchor_id: uuid.UUID):
        super().__init__(convert_charrefs=True)
        self.target = str(anchor_id)
        self.active_depth = 0
        self.matches = 0
        self.fragments: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.active_depth:
            if tag == "br":
                self.fragments.append(" ")
            if tag not in self._VOID_TAGS:
                self.active_depth += 1
            return
        if tag == "span" and dict(attrs).get("data-comment-anchor") == self.target:
            self.matches += 1
            self.active_depth = 1

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.active_depth:
            return
        if tag == "span" and dict(attrs).get("data-comment-anchor") == self.target:
            self.matches += 1

    def handle_endtag(self, _tag: str) -> None:
        if self.active_depth:
            self.active_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.active_depth:
            self.fragments.append(data)


def document_comment_anchor_quote(html: str, anchor_id: uuid.UUID) -> str | None:
    """Return normalized visible text for one or more spans sharing anchor_id."""
    parser = _CommentAnchorParser(anchor_id)
    parser.feed(html)
    parser.close()
    if parser.matches == 0:
        return None
    return normalize_anchor_quote("".join(parser.fragments))
