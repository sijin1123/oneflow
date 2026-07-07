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
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member
from app.db.session import get_session
from app.models.project_type import ProjectType
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
from app.services.importers import map_jira_csv
from app.services.sanitize import sanitize_html

router = APIRouter()

# Excel/LibreOffice read a leading U+FEFF as a BOM and open UTF-8 correctly; without
# it, Korean text opens mojibake'd on Windows Excel (the tool a real migration uses).
BOM = "﻿"

# Spreadsheet formula-injection (CWE-1236): a cell beginning with any of these is
# evaluated as a formula/DDE when the CSV is opened in Excel/Sheets/LibreOffice.
_FORMULA_TRIGGERS = ("=", "+", "-", "@", "\t", "\r")

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


def _guard_formula(text: str) -> str:
    """Neutralize spreadsheet formula injection on export by prefixing a single
    quote when the cell would otherwise be evaluated. Reversed by _unguard_formula
    on import so an export→import round-trip stays lossless."""
    if text and text[0] in _FORMULA_TRIGGERS:
        return "'" + text
    return text


def _unguard_formula(text: str) -> str:
    """Inverse of _guard_formula: strip a single leading quote that guards a
    formula-trigger character, so a re-imported export recovers the true value."""
    if len(text) >= 2 and text[0] == "'" and text[1] in _FORMULA_TRIGGERS:
        return text[1:]
    return text


def _canonical_cell(value: object) -> str:
    """Render a cell for the checksum in a numeric-normalized form.

    estimated_hours reaches export as a scale-2 Decimal ('3.00') but import as a
    float (3.0); normalizing both to the same canonical numeric string keeps the
    round-trip 건수/체크섬 대사 accurate (review: Decimal↔float checksum drift)."""
    if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
        try:
            return format(Decimal(str(value)).normalize(), "f")
        except (InvalidOperation, ValueError):
            return str(value)
    return "" if value is None else str(value)


def _canonical(rows: list[dict]) -> str:
    """Deterministic serialization of the importable columns for checksum/대사.

    Uses a unit-separator between fields so cell content can never collide with the
    delimiter. Export and import build this identically, so a lossless round-trip
    yields the same checksum."""
    lines = []
    for r in rows:
        lines.append("\x1f".join(_canonical_cell(r.get(c)) for c in IMPORT_COLUMNS))
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
    buf.write(BOM)  # Excel-on-Windows UTF-8 hint (stripped again on import)
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(IMPORT_COLUMNS)
    for r in dict_rows:
        writer.writerow([_guard_formula(_cell(r[c])) for c in IMPORT_COLUMNS])

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
        # Strip a UTF-8 BOM (present when re-importing our own Excel-friendly export
        # or an Excel-saved file) so the first header cell still matches 'subject'.
        key = name.lstrip(BOM).strip().lower()
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
        # Reverse the export-side formula guard before trimming so a re-imported
        # export recovers the exact stored value (round-trip 대사 stays lossless).
        raw = _unguard_formula(row[i]).strip() if i < len(row) else ""
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
    await require_member(session, project_id, user, write=True)
    # Disabled work-item types are invalid for NEW rows (Pass 7 PR-R) — fetch
    # once, then judge per row so a bad type isolates that row, not the import.
    disabled_types = set(
        (
            await session.execute(
                select(ProjectType.key).where(
                    ProjectType.project_id == project_id, ProjectType.is_active.is_(False)
                )
            )
        ).scalars()
    )

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
        if model.type in disabled_types:
            errors.append(
                CsvRowError(
                    row=total,
                    message=f"type: '{model.type}' is disabled in this project",
                    raw=_reserialize(row),
                )
            )
            continue
        valid_models.append(model)
        valid_dicts.append({c: getattr(model, c) for c in IMPORT_COLUMNS})

    inserted = 0
    if not body.dry_run and valid_models:
        for model in valid_models:
            data = model.model_dump()
            # The server is the authoritative XSS boundary: sanitize rich-text HTML
            # on this write path too, exactly like the create/patch endpoints.
            data["description"] = sanitize_html(data["description"])
            wp = WorkPackage(project_id=project_id, created_by=user.id, **data)
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


@router.post("/projects/{project_id}/work-packages/import/jira", response_model=CsvImportResult)
async def import_jira_csv(
    project_id: uuid.UUID,
    body: CsvImportRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CsvImportResult:
    """Jira CSV export → work packages (Pass 8 PR-T, PLAN v8.1 contract).

    The adapter maps columns/values deterministically; this endpoint reuses the
    standard import semantics: row-level isolation, disabled-type rejection,
    dry-run preview, and — for idempotent re-uploads — a duplicate guard that
    isolates rows whose subject (usually "[KEY] Summary") already exists."""
    await require_member(session, project_id, user, write=True)
    disabled_types = set(
        (
            await session.execute(
                select(ProjectType.key).where(
                    ProjectType.project_id == project_id, ProjectType.is_active.is_(False)
                )
            )
        ).scalars()
    )

    mapped = map_jira_csv(body.content)
    if mapped.header_error:
        raise HTTPException(status_code=422, detail=mapped.header_error)
    if len(mapped.rows) > MAX_IMPORT_ROWS:
        raise HTTPException(
            status_code=422, detail=f"import exceeds the {MAX_IMPORT_ROWS}-row limit"
        )

    # Duplicate guard (idempotent re-upload): one query for existing subjects,
    # plus batch-internal dedupe.
    candidate_subjects = [p["subject"] for (_, p, err, _) in mapped.rows if p and not err]
    existing: set[str] = set()
    if candidate_subjects:
        existing = set(
            (
                await session.execute(
                    select(WorkPackage.subject).where(
                        WorkPackage.project_id == project_id,
                        WorkPackage.subject.in_(candidate_subjects),
                    )
                )
            ).scalars()
        )
    seen_in_batch: set[str] = set()

    valid_models: list[WorkPackageCreate] = []
    valid_dicts: list[dict] = []
    errors: list[CsvRowError] = []
    total = 0

    for row_number, payload, map_error, raw in mapped.rows:
        total += 1
        if map_error:
            errors.append(CsvRowError(row=row_number, message=map_error, raw=raw))
            continue
        assert payload is not None
        subject = payload["subject"]
        if subject in existing or subject in seen_in_batch:
            errors.append(
                CsvRowError(
                    row=row_number,
                    message="이미 가져온 이슈입니다(동일 제목 존재)",
                    raw=raw,
                )
            )
            continue
        try:
            model = WorkPackageCreate(**payload)
        except ValidationError as exc:
            first = exc.errors()[0]
            loc = ".".join(str(p) for p in first.get("loc", ())) or "row"
            errors.append(CsvRowError(row=row_number, message=f"{loc}: {first['msg']}", raw=raw))
            continue
        if model.type in disabled_types:
            errors.append(
                CsvRowError(
                    row=row_number,
                    message=f"type: '{model.type}' is disabled in this project",
                    raw=raw,
                )
            )
            continue
        seen_in_batch.add(subject)
        valid_models.append(model)
        valid_dicts.append({c: getattr(model, c) for c in IMPORT_COLUMNS})

    inserted = 0
    if not body.dry_run and valid_models:
        for model in valid_models:
            data = model.model_dump()
            data["description"] = sanitize_html(data["description"])
            wp = WorkPackage(project_id=project_id, created_by=user.id, **data)
            session.add(wp)
            await session.flush()
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
        notes=mapped.notes,
    )
