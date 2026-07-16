"""Bounded search-text extraction for uploaded attachments.

Only a closed set of UTF-8 text-family formats is indexed. The source blob
remains authoritative; this module produces disposable derived search data.
"""

import csv
import io
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from app.models.attachment import Attachment
from app.services.storage import LocalStorage

MAX_ATTACHMENT_SEARCH_BYTES = 512 * 1024
MAX_ATTACHMENT_SEARCH_CHARS = 512 * 1024
SUPPORTED_ATTACHMENT_SEARCH_TYPES = frozenset(
    {
        "application/json",
        "text/csv",
        "text/markdown",
        "text/plain",
        "text/tab-separated-values",
    }
)
AttachmentSearchStatus = Literal[
    "not_applicable",
    "pending",
    "indexed",
    "unsupported",
    "too_large",
    "invalid_text",
    "missing_blob",
]

_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


@dataclass(frozen=True)
class AttachmentSearchExtraction:
    status: AttachmentSearchStatus
    text: str | None = None


def normalized_content_type(content_type: str | None) -> str:
    return (content_type or "").split(";", 1)[0].strip().lower()


def _normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFC", value.replace("\r\n", "\n").replace("\r", "\n"))
    return _CONTROL_RE.sub("", value)[:MAX_ATTACHMENT_SEARCH_CHARS]


def _structured_text(value: str, content_type: str) -> str:
    if content_type == "application/json":
        parsed = json.loads(value)
        return json.dumps(parsed, ensure_ascii=False, separators=(",", ":"))
    if content_type in {"text/csv", "text/tab-separated-values"}:
        delimiter = "\t" if content_type == "text/tab-separated-values" else ","
        rows = csv.reader(io.StringIO(value), delimiter=delimiter)
        return "\n".join(" ".join(cell for cell in row if cell) for row in rows)
    return value


def extract_attachment_search_text(
    path: Path | None,
    *,
    content_type: str | None,
    size_bytes: int | None,
) -> AttachmentSearchExtraction:
    media_type = normalized_content_type(content_type)
    if media_type not in SUPPORTED_ATTACHMENT_SEARCH_TYPES:
        return AttachmentSearchExtraction("unsupported")
    if size_bytes is not None and size_bytes > MAX_ATTACHMENT_SEARCH_BYTES:
        return AttachmentSearchExtraction("too_large")
    if path is None:
        return AttachmentSearchExtraction("missing_blob")

    try:
        with path.open("rb") as source:
            raw = source.read(MAX_ATTACHMENT_SEARCH_BYTES + 1)
    except OSError:
        return AttachmentSearchExtraction("missing_blob")
    if len(raw) > MAX_ATTACHMENT_SEARCH_BYTES:
        return AttachmentSearchExtraction("too_large")
    try:
        decoded = raw.decode("utf-8-sig", errors="strict")
        normalized = _normalize_text(_structured_text(decoded, media_type))
    except (
        UnicodeDecodeError,
        csv.Error,
        json.JSONDecodeError,
        TypeError,
        ValueError,
        RecursionError,
    ):
        return AttachmentSearchExtraction("invalid_text")
    return AttachmentSearchExtraction("indexed", normalized)


def apply_attachment_search_index(attachment: Attachment, storage: LocalStorage) -> None:
    if attachment.storage_key is None:
        attachment.search_index_status = "not_applicable"
        attachment.search_text = None
        attachment.search_indexed_at = None
        return

    result = extract_attachment_search_text(
        storage.path(attachment.storage_key),
        content_type=attachment.content_type,
        size_bytes=attachment.size_bytes,
    )
    attachment.search_index_status = result.status
    attachment.search_text = result.text
    attachment.search_indexed_at = datetime.now(UTC)
