"""CSV import/export contracts (PLAN §3 Phase 2 — dry-run·건수/체크섬 대사·실패 행 격리·재처리).

The importable column set is intentionally the scalar, project-local fields of a
work package. Cross-project reference fields (assignee_id/parent_id/milestone_id)
are excluded from bulk CSV so a paste cannot smuggle foreign-project UUIDs past the
per-endpoint FK guards; they remain editable in the detail drawer. Export emits
exactly these columns, so an export→import round-trip is lossless for scalar data.
"""

import uuid
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# Fixed column order — shared by export writer, import reader, and the canonical
# checksum. Changing the order changes the checksum, so treat this as a contract.
IMPORT_COLUMNS: tuple[str, ...] = (
    "subject",
    "description",
    "type",
    "status",
    "priority",
    "start_date",
    "due_date",
    "estimated_hours",
)

# Upper bound on a single import to keep a paste from becoming an unbounded write.
MAX_IMPORT_ROWS = 5000
MAX_IMPORT_ASSIGNEE_IDENTITIES = 500


class CsvImportAssigneeMapping(BaseModel):
    source_value: str = Field(min_length=1, max_length=255)
    user_id: uuid.UUID | None

    @field_validator("source_value")
    @classmethod
    def _source_value(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("source_value must not be blank")
        return value


class CsvImportRequest(BaseModel):
    content: str = Field(max_length=5_000_000)
    # Safe default: preview-only. The client must opt in to actually writing.
    dry_run: bool = True
    # Adapter commits bind to the latest dry-run result. Legacy files without
    # people fields remain compatible, but every mapped identity requires this.
    preview_checksum: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    assignee_mappings: list[CsvImportAssigneeMapping] = Field(
        default_factory=list,
        max_length=MAX_IMPORT_ASSIGNEE_IDENTITIES,
    )


class CsvRowError(BaseModel):
    """One rejected row, isolated so the rest of the batch still commits.

    `raw` is the row re-serialized as a single CSV line so the operator can fix it
    and resubmit only the failed rows (재처리 정책)."""

    row: int  # 1-based data row number (header excluded)
    message: str
    raw: str


class CsvImportAssigneeIdentity(BaseModel):
    source_value: str
    row_count: int
    suggested_user_id: uuid.UUID | None = None
    suggested_display_name: str | None = None
    suggested_email: str | None = None
    selected_user_id: uuid.UUID | None = None
    selected_display_name: str | None = None


class CsvImportAssignableMember(BaseModel):
    user_id: uuid.UUID
    email: str
    display_name: str
    role: Literal["owner", "member"]


class CsvImportResult(BaseModel):
    dry_run: bool
    total_rows: int  # data rows seen (header excluded)
    valid: int
    invalid: int
    inserted: int  # 0 when dry_run
    # sha256 over the canonical form of the valid rows — lets the operator reconcile
    # a preview against the committed import (건수/체크섬 대사).
    checksum: str
    # sha256 over the exact uploaded text. Adapter commits submit this value so
    # edited content cannot reuse an earlier assignee decision, while concurrent
    # duplicate isolation remains a normal successful import outcome.
    preview_checksum: str
    errors: list[CsvRowError]
    # Import-source notes (Jira adapter etc.): unmapped assignees, fallback
    # counts, ignored columns — silent data loss is not allowed (PLAN v8.1).
    notes: list[str] = Field(default_factory=list)
    assignee_identities: list[CsvImportAssigneeIdentity] = Field(default_factory=list)
    assignable_members: list[CsvImportAssignableMember] = Field(default_factory=list)
