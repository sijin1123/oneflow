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
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.member import ProjectMember
from app.models.project_type import BUILTIN_TYPE_KEYS, ProjectType
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.csv_io import (
    IMPORT_COLUMNS,
    MAX_IMPORT_ASSIGNEE_IDENTITIES,
    MAX_IMPORT_ROWS,
    CsvImportAssignableMember,
    CsvImportAssigneeIdentity,
    CsvImportRequest,
    CsvImportResult,
    CsvRowError,
)
from app.schemas.data_transfer_job import DataTransferExportCreated
from app.schemas.work_package import WorkPackageCreate
from app.services.activity import record_created
from app.services.data_transfers import persist_import_job, persist_transfer_job
from app.services.importers import JiraMapResult, map_jira_csv, map_linear_csv
from app.services.sanitize import sanitize_html
from app.services.storage import LocalStorage
from app.services.webhooks import enqueue_work_package_event

router = APIRouter()

# Advisory-lock classid serializing import WRITES per project (Pass 42 PR-BH;
# 427003 belongs to project_types).
IMPORT_LOCK_CLASSID = 427008


async def _project_type_sets(
    session: AsyncSession, project_id: uuid.UUID
) -> tuple[set[str], set[str]]:
    rows = (
        await session.execute(
            select(ProjectType.key, ProjectType.is_active).where(
                ProjectType.project_id == project_id
            )
        )
    ).all()
    if not rows:
        return set(BUILTIN_TYPE_KEYS), set()
    return {key for key, _active in rows}, {key for key, active in rows if not active}


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


def _preview_checksum(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


@router.get("/projects/{project_id}/work-packages/export.csv")
async def export_work_packages_csv(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await require_member(session, project_id, user)
    content, dict_rows, checksum = await _build_export(session, project_id)
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="work-packages.csv"',
            "X-OneFlow-Row-Count": str(len(dict_rows)),
            "X-OneFlow-Checksum": checksum,
        },
    )


async def _build_export(
    session: AsyncSession, project_id: uuid.UUID
) -> tuple[str, list[dict], str]:
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

    content = buf.getvalue()
    return content, dict_rows, _checksum(dict_rows)


@router.post(
    "/projects/{project_id}/data-transfer-jobs/export",
    response_model=DataTransferExportCreated,
    status_code=201,
)
async def create_export_job(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> DataTransferExportCreated:
    await require_member(session, project_id, user)
    content, dict_rows, checksum = await _build_export(session, project_id)
    filename = f"oneflow-work-packages-{project_id}.csv"
    job = await persist_transfer_job(
        session,
        storage=LocalStorage(settings.storage_dir),
        project_id=project_id,
        user=user,
        direction="export",
        source="oneflow",
        dry_run=False,
        total_rows=len(dict_rows),
        valid_rows=len(dict_rows),
        invalid_rows=0,
        inserted_rows=0,
        checksum=checksum,
        artifact=content.encode("utf-8"),
        artifact_filename=filename,
        artifact_max_bytes=settings.upload_max_bytes,
    )
    assert job.artifact_sha256 is not None
    assert job.artifact_size_bytes is not None
    return DataTransferExportCreated(
        job_id=job.id,
        row_count=len(dict_rows),
        checksum=checksum,
        artifact_sha256=job.artifact_sha256,
        artifact_filename=filename,
        artifact_size_bytes=job.artifact_size_bytes,
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
    settings: Settings = Depends(get_settings),
) -> CsvImportResult:
    await require_member(session, project_id, user, write=True)
    # Disabled work-item types are invalid for NEW rows (Pass 7 PR-R) — fetch
    # once, then judge per row so a bad type isolates that row, not the import.
    known_types, disabled_types = await _project_type_sets(session, project_id)

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
        if model.type not in known_types:
            errors.append(
                CsvRowError(
                    row=total,
                    message=f"type: unknown type '{model.type}' in this project",
                    raw=_reserialize(row),
                )
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
        # Same per-project import serialization as the adapter pipeline
        # (Pass 42 PR-BH) — cheap, and keeps every import write path uniform.
        await session.execute(
            text("SELECT pg_advisory_xact_lock(:classid, hashtext(:pid))").bindparams(
                classid=IMPORT_LOCK_CLASSID, pid=str(project_id)
            )
        )
        for model in valid_models:
            data = model.model_dump()
            # The server is the authoritative XSS boundary: sanitize rich-text HTML
            # on this write path too, exactly like the create/patch endpoints.
            data["description"] = sanitize_html(data["description"])
            wp = WorkPackage(project_id=project_id, created_by=user.id, **data)
            session.add(wp)
            await session.flush()  # assign wp.id for the activity FK
            record_created(session, wp.id, user.id)
            await enqueue_work_package_event(
                session, settings, "work_package.created", wp, list(data)
            )
        await session.flush()
        inserted = len(valid_models)

    result = CsvImportResult(
        dry_run=body.dry_run,
        total_rows=total,
        valid=len(valid_models),
        invalid=len(errors),
        inserted=inserted,
        checksum=_checksum(valid_dicts),
        preview_checksum=_preview_checksum(body.content),
        errors=errors,
    )
    await persist_import_job(
        session,
        storage=LocalStorage(settings.storage_dir),
        project_id=project_id,
        user=user,
        source="oneflow",
        result=result,
    )
    return result


async def _run_mapped_import(
    session: AsyncSession,
    user: User,
    project_id: uuid.UUID,
    mapped: JiraMapResult,
    body: CsvImportRequest,
    settings: Settings,
) -> CsvImportResult:
    """Shared adapter-import pipeline (Jira #77 / Linear Pass 25): row
    isolation, duplicate guard, disabled-type rejection, dry-run — the
    response shape is identical for every adapter (v25.1 R1-②)."""
    known_types, disabled_types = await _project_type_sets(session, project_id)

    if mapped.header_error:
        raise HTTPException(status_code=422, detail=mapped.header_error)
    if len(mapped.rows) > MAX_IMPORT_ROWS:
        raise HTTPException(
            status_code=422, detail=f"import exceeds the {MAX_IMPORT_ROWS}-row limit"
        )

    # Serialize imports per project (Pass 42 PR-BH): the duplicate guard is
    # read-then-write — without the lock, two concurrent uploads of the same
    # file both pass the SELECT and insert duplicates. Blocking (not 409):
    # the later request proceeds after the first commits and skips its rows
    # as duplicates. Dry-run is read-only and takes no lock.
    if not body.dry_run:
        await session.execute(
            text("SELECT pg_advisory_xact_lock(:classid, hashtext(:pid))").bindparams(
                classid=IMPORT_LOCK_CLASSID, pid=str(project_id)
            )
        )

    # Duplicate guard (idempotent re-upload): one query for existing subjects,
    # plus batch-internal dedupe.
    candidate_subjects = [
        row.payload["subject"] for row in mapped.rows if row.payload and not row.error
    ]
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

    valid_models: list[tuple[WorkPackageCreate, str | None]] = []
    valid_dicts: list[dict] = []
    errors: list[CsvRowError] = []
    total = 0
    identity_counts: dict[str, tuple[str, int]] = {}

    for mapped_row in mapped.rows:
        row_number = mapped_row.row_number
        payload = mapped_row.payload
        map_error = mapped_row.error
        raw = mapped_row.raw
        total += 1
        if map_error:
            errors.append(CsvRowError(row=row_number, message=map_error, raw=raw))
            continue
        assert payload is not None
        try:
            model = WorkPackageCreate(**payload)
        except ValidationError as exc:
            first = exc.errors()[0]
            loc = ".".join(str(p) for p in first.get("loc", ())) or "row"
            errors.append(CsvRowError(row=row_number, message=f"{loc}: {first['msg']}", raw=raw))
            continue
        if model.type not in known_types:
            errors.append(
                CsvRowError(
                    row=row_number,
                    message=f"type: unknown type '{model.type}' in this project",
                    raw=raw,
                )
            )
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
        if mapped_row.assignee_source is not None:
            source_key = mapped_row.assignee_source.casefold()
            display, count = identity_counts.get(
                source_key,
                (mapped_row.assignee_source, 0),
            )
            identity_counts[source_key] = (display, count + 1)
        subject = model.subject
        if subject in existing or subject in seen_in_batch:
            errors.append(
                CsvRowError(
                    row=row_number,
                    message="이미 가져온 이슈입니다(동일 제목 존재)",
                    raw=raw,
                )
            )
            continue
        seen_in_batch.add(subject)
        valid_models.append((model, mapped_row.assignee_source))
        valid_dicts.append({c: getattr(model, c) for c in IMPORT_COLUMNS})

    if len(identity_counts) > MAX_IMPORT_ASSIGNEE_IDENTITIES:
        raise HTTPException(
            status_code=422,
            detail=(
                "import exceeds the "
                f"{MAX_IMPORT_ASSIGNEE_IDENTITIES}-identity assignee mapping limit"
            ),
        )

    assignable_users: list[tuple[ProjectMember, User]] = []
    if identity_counts:
        assignable_stmt = (
            select(ProjectMember, User)
            .join(User, ProjectMember.user_id == User.id)
            .where(
                ProjectMember.project_id == project_id,
                ProjectMember.role.in_(("owner", "member")),
                User.is_active.is_(True),
            )
            .order_by(User.display_name.asc(), User.email.asc(), User.id.asc())
        )
        # Commit-time row locks prevent membership removal, role demotion or user
        # deactivation from racing after validation and before assignment.
        if not body.dry_run:
            assignable_stmt = assignable_stmt.with_for_update()
        assignable_users = list((await session.execute(assignable_stmt)).all())

    assignable_by_id = {member.user_id: user for member, user in assignable_users}
    exact_email = {user.email.casefold(): user for _, user in assignable_users}
    checksum = _checksum(valid_dicts)
    preview_checksum = _preview_checksum(body.content)
    mapping_by_key: dict[str, uuid.UUID | None] = {}
    for mapping in body.assignee_mappings:
        key = mapping.source_value.casefold()
        if key in mapping_by_key:
            raise HTTPException(
                status_code=422,
                detail=f"duplicate assignee mapping for '{mapping.source_value}'",
            )
        mapping_by_key[key] = mapping.user_id

    selected_users: dict[str, User | None] = {}
    if not body.dry_run:
        if body.preview_checksum is not None and body.preview_checksum != preview_checksum:
            raise HTTPException(
                status_code=409,
                detail="import preview is stale; run dry-run again",
            )
        required_keys = set(identity_counts)
        if required_keys:
            if body.preview_checksum is None:
                raise HTTPException(
                    status_code=422,
                    detail="preview_checksum is required when assignee values are present",
                )
            missing = required_keys - set(mapping_by_key)
            unknown = set(mapping_by_key) - required_keys
            if missing or unknown:
                raise HTTPException(
                    status_code=422,
                    detail="assignee mappings must explicitly cover every preview identity",
                )
            for key, mapped_user_id in mapping_by_key.items():
                if mapped_user_id is None:
                    selected_users[key] = None
                    continue
                selected = assignable_by_id.get(mapped_user_id)
                if selected is None:
                    raise HTTPException(
                        status_code=422,
                        detail="mapped assignee must be an active project owner or member",
                    )
                selected_users[key] = selected
            for model, source_value in valid_models:
                if source_value is not None:
                    selected = selected_users[source_value.casefold()]
                    model.assignee_id = selected.id if selected is not None else None
        elif mapping_by_key:
            raise HTTPException(
                status_code=422,
                detail="assignee mappings were provided but the preview has no identities",
            )

    inserted = 0
    if not body.dry_run and valid_models:
        for model, _ in valid_models:
            data = model.model_dump()
            data["description"] = sanitize_html(data["description"])
            wp = WorkPackage(project_id=project_id, created_by=user.id, **data)
            session.add(wp)
            await session.flush()
            record_created(session, wp.id, user.id)
            await enqueue_work_package_event(
                session, settings, "work_package.created", wp, list(data)
            )
        await session.flush()
        inserted = len(valid_models)

    notes = list(mapped.notes)
    if identity_counts:
        if body.dry_run:
            notes.append(
                f"담당자 원본 값 {len(identity_counts)}개를 확인했습니다. "
                "각 값을 프로젝트 멤버 또는 미배정으로 결정하세요."
            )
        else:
            applied_counts: dict[str, int] = {}
            for _, source_value in valid_models:
                if source_value is not None:
                    key = source_value.casefold()
                    applied_counts[key] = applied_counts.get(key, 0) + 1
            mapped_rows = sum(applied_counts.values())
            assigned_rows = sum(
                count
                for key, count in applied_counts.items()
                if selected_users.get(key) is not None
            )
            notes.append(
                f"담당자 매핑으로 {assigned_rows}건을 배정하고 "
                f"{mapped_rows - assigned_rows}건의 원본 담당자 값을 미배정으로 가져왔습니다."
            )

    assignee_identities: list[CsvImportAssigneeIdentity] = []
    for key, (source_value, row_count) in identity_counts.items():
        suggestion = exact_email.get(key)
        selected = selected_users.get(key)
        assignee_identities.append(
            CsvImportAssigneeIdentity(
                source_value=source_value,
                row_count=row_count,
                suggested_user_id=suggestion.id if suggestion else None,
                suggested_display_name=suggestion.display_name if suggestion else None,
                suggested_email=suggestion.email if suggestion else None,
                selected_user_id=selected.id if selected else None,
                selected_display_name=selected.display_name if selected else None,
            )
        )

    return CsvImportResult(
        dry_run=body.dry_run,
        total_rows=total,
        valid=len(valid_models),
        invalid=len(errors),
        inserted=inserted,
        checksum=checksum,
        preview_checksum=preview_checksum,
        errors=errors,
        notes=notes,
        assignee_identities=assignee_identities,
        assignable_members=[
            CsvImportAssignableMember(
                user_id=user_row.id,
                email=user_row.email,
                display_name=user_row.display_name,
                role=member.role,
            )
            for member, user_row in assignable_users
        ],
    )


@router.post("/projects/{project_id}/work-packages/import/jira", response_model=CsvImportResult)
async def import_jira_csv(
    project_id: uuid.UUID,
    body: CsvImportRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> CsvImportResult:
    """Jira CSV export → work packages (Pass 8 PR-T, PLAN v8.1 contract).

    The adapter maps columns/values deterministically; the shared pipeline
    applies row-level isolation, disabled-type rejection, dry-run preview and
    the idempotent-re-upload duplicate guard ("[KEY] Summary" subjects)."""
    await require_member(session, project_id, user, write=True)
    result = await _run_mapped_import(
        session, user, project_id, map_jira_csv(body.content), body, settings
    )
    await persist_import_job(
        session,
        storage=LocalStorage(settings.storage_dir),
        project_id=project_id,
        user=user,
        source="jira",
        result=result,
    )
    return result


@router.post("/projects/{project_id}/work-packages/import/linear", response_model=CsvImportResult)
async def import_linear_csv(
    project_id: uuid.UUID,
    body: CsvImportRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> CsvImportResult:
    """Linear CSV export → work packages (Pass 25 PR-AQ, PLAN v25.1 contract —
    same pipeline and response shape as the Jira adapter)."""
    await require_member(session, project_id, user, write=True)
    result = await _run_mapped_import(
        session, user, project_id, map_linear_csv(body.content), body, settings
    )
    await persist_import_job(
        session,
        storage=LocalStorage(settings.storage_dir),
        project_id=project_id,
        user=user,
        source="linear",
        result=result,
    )
    return result
