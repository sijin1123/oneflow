"""CSV import/export contracts (PLAN §3 Phase 2 — dry-run·건수/체크섬 대사·실패 행 격리·재처리).

The importable column set is intentionally the scalar, project-local fields of a
work package. Cross-project reference fields (assignee_id/parent_id/milestone_id)
are excluded from bulk CSV so a paste cannot smuggle foreign-project UUIDs past the
per-endpoint FK guards; they remain editable in the detail drawer. Export emits
exactly these columns, so an export→import round-trip is lossless for scalar data.
"""

from pydantic import BaseModel, Field

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


class CsvImportRequest(BaseModel):
    content: str = Field(max_length=5_000_000)
    # Safe default: preview-only. The client must opt in to actually writing.
    dry_run: bool = True


class CsvRowError(BaseModel):
    """One rejected row, isolated so the rest of the batch still commits.

    `raw` is the row re-serialized as a single CSV line so the operator can fix it
    and resubmit only the failed rows (재처리 정책)."""

    row: int  # 1-based data row number (header excluded)
    message: str
    raw: str


class CsvImportResult(BaseModel):
    dry_run: bool
    total_rows: int  # data rows seen (header excluded)
    valid: int
    invalid: int
    inserted: int  # 0 when dry_run
    # sha256 over the canonical form of the valid rows — lets the operator reconcile
    # a preview against the committed import (건수/체크섬 대사).
    checksum: str
    errors: list[CsvRowError]
