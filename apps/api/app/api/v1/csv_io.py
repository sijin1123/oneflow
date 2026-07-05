"""CSV export/import for work packages (PLAN §3 Phase 2).

Design requirements carried from the plan:
- dry-run preview before any write,
- 건수/체크섬 대사 (row-count + checksum reconciliation) on both directions,
- 실패 행 격리 (bad rows are skipped, good rows still commit),
- 재처리 정책 (each error carries the re-serialized row for targeted resubmission).
"""

import csv
import hashlib
import io
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member
from app.db.session import get_session
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.csv_io import (
    IMPORT_COLUMNS,
    MAX_IMPORT_ROWS,
    CsvImportRequest,
    CsvImportResult,
    CsvRowError,
)
from app.schemas.work_package import WorkPackageCreate
from app.services.activity import record_created

router = APIRouter()

# Fields carried by CSV, in the fixed IMPORT_COLUMNS order. Optional fields become
# None on an empty cell; a validator on WorkPackageCreate rejects anything malformed.
_OPTIONAL_CELLS = {
    "description",
    "type",
    "status",
    "priority",
    "start_date",
    "due_date",
    "estimated_hours",
}


def _cell(value: object) -> str:
    """Render a stored value for a CSV cell (None → empty)."""
    return "" if value is None else str(value)


def _canonical(rows: list[dict]) -> str:
    """Deterministic serialization of the importable columns for checksum/대사.

    Uses a unit-separator between fields so cell content can never collide with the
    delimiter. Export and import build this identically, so a lossless round-trip
    yields the same checksum."""
    lines = []
    for r in rows:
        lines.append("\x1f".join(_cell(r.get(c)) for c in IMPORT_COLUMNS))
    return "\n".join(lines)


def _checksum(rows: list[dict]) -> str:
    return hashlib.sha256(_canonical(rows).encode("utf-8")).hexdigest()


@router.get("/projects/{project_id}/work-packages/export.csv")
async def export_work_packages_csv(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await require_member(session, project_id, user)
    rows = (
        (
            await session.execute(
                select(WorkPackage)
                .where(WorkPackage.project_id == project_id)
                .order_by(WorkPackage.created_at.asc(), WorkPackage.id.asc())
            )
        )
        .scalars()
        .all()
    )
    dict_rows = [{c: getattr(wp, c) for c in IMPORT_COLUMNS} for wp in rows]

    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(IMPORT_COLUMNS)
    for r in dict_rows:
        writer.writerow([_cell(r[c]) for c in IMPORT_COLUMNS])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="work-packages.csv"',
            # Reconciliation headers (건수/체크섬 대사): compare against the import result.
            "X-OneFlow-Row-Count": str(len(dict_rows)),
            "X-OneFlow-Checksum": _checksum(dict_rows),
        },
    )


def _parse_header(header: list[str]) -> dict[str, int]:
    """Map each known importable column to its cell index. `subject` is required."""
    index: dict[str, int] = {}
    for i, name in enumerate(header):
        key = name.strip().lower()
        if key in IMPORT_COLUMNS and key not in index:
            index[key] = i
    if "subject" not in index:
        raise HTTPException(
            status_code=422,
            detail="CSV header must include a 'subject' column",
        )
    return index


def _row_to_payload(row: list[str], index: dict[str, int]) -> dict:
    """Extract importable cells from a physical row (missing cells → empty)."""
    payload: dict[str, object] = {}
    for col, i in index.items():
        raw = row[i].strip() if i < len(row) else ""
        if col in _OPTIONAL_CELLS and raw == "":
            payload[col] = None
        else:
            payload[col] = raw
    return payload


def _reserialize(row: list[str]) -> str:
    """Re-emit a parsed row as one CSV line for the reprocessing payload."""
    out = io.StringIO()
    csv.writer(out, lineterminator="").writerow(row)
    return out.getvalue()


@router.post(
    "/projects/{project_id}/work-packages/import",
    response_model=CsvImportResult,
)
async def import_work_packages_csv(
    project_id: uuid.UUID,
    body: CsvImportRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CsvImportResult:
    await require_member(session, project_id, user)

    reader = csv.reader(io.StringIO(body.content))
    try:
        header = next(reader)
    except StopIteration:
        raise HTTPException(status_code=422, detail="CSV is empty") from None
    index = _parse_header(header)

    valid_models: list[WorkPackageCreate] = []
    valid_dicts: list[dict] = []
    errors: list[CsvRowError] = []
    total = 0

    for row in reader:
        # Skip fully blank physical lines (trailing newline, spacer rows).
        if not any(cell.strip() for cell in row):
            continue
        total += 1
        if total > MAX_IMPORT_ROWS:
            raise HTTPException(
                status_code=422,
                detail=f"import exceeds the {MAX_IMPORT_ROWS}-row limit",
            )
        payload = _row_to_payload(row, index)
        try:
            model = WorkPackageCreate(**payload)
        except ValidationError as exc:
            first = exc.errors()[0]
            loc = ".".join(str(p) for p in first.get("loc", ())) or "row"
            errors.append(
                CsvRowError(row=total, message=f"{loc}: {first['msg']}", raw=_reserialize(row))
            )
            continue
        valid_models.append(model)
        valid_dicts.append({c: getattr(model, c) for c in IMPORT_COLUMNS})

    inserted = 0
    if not body.dry_run and valid_models:
        for model in valid_models:
            wp = WorkPackage(project_id=project_id, **model.model_dump())
            session.add(wp)
            await session.flush()  # assign wp.id for the activity FK
            record_created(session, wp.id, user.id)
        await session.flush()
        await session.commit()
        inserted = len(valid_models)

    return CsvImportResult(
        dry_run=body.dry_run,
        total_rows=total,
        valid=len(valid_models),
        invalid=len(errors),
        inserted=inserted,
        checksum=_checksum(valid_dicts),
        errors=errors,
    )
