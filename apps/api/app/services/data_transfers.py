import contextlib
import hashlib
import uuid
from collections.abc import AsyncIterator

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_transfer_job import DataTransferJob
from app.models.user import User
from app.schemas.csv_io import CsvImportResult
from app.services.storage import LocalStorage, storage_key

TRANSFER_JOB_LOCK_CLASSID = 427009
MAX_TRANSFER_JOBS_PER_PROJECT = 100
MAX_STORED_ERROR_ROWS = 100


def _sqlstate(exc: DBAPIError) -> str | None:
    original = exc.orig
    return getattr(original, "sqlstate", None) or getattr(original, "pgcode", None)


def _delete_artifact(storage: LocalStorage, key: str | None) -> None:
    if key:
        with contextlib.suppress(OSError):
            storage.delete(key)


async def _one_chunk(content: bytes) -> AsyncIterator[bytes]:
    yield content


async def persist_transfer_job(
    session: AsyncSession,
    *,
    storage: LocalStorage,
    project_id: uuid.UUID,
    user: User,
    direction: str,
    source: str,
    dry_run: bool,
    total_rows: int,
    valid_rows: int,
    invalid_rows: int,
    inserted_rows: int,
    checksum: str,
    errors: list[dict] | None = None,
    notes: list[str] | None = None,
    artifact: bytes | None = None,
    artifact_filename: str | None = None,
    artifact_max_bytes: int | None = None,
) -> DataTransferJob:
    job_id = uuid.uuid4()
    artifact_key: str | None = None
    artifact_sha256: str | None = None
    artifact_size: int | None = None
    if artifact is not None:
        if artifact_max_bytes is not None and len(artifact) > artifact_max_bytes:
            raise HTTPException(status_code=413, detail="export exceeds the artifact size limit")
        artifact_key = storage_key(project_id, job_id)
        artifact_sha256 = hashlib.sha256(artifact).hexdigest()
        artifact_size = await storage.save_stream(artifact_key, _one_chunk(artifact))

    stored_errors = list(errors or [])[:MAX_STORED_ERROR_ROWS]
    job = DataTransferJob(
        id=job_id,
        project_id=project_id,
        actor_id=user.id,
        actor_name=user.display_name,
        direction=direction,
        source=source,
        dry_run=dry_run,
        status="completed_with_errors" if invalid_rows else "completed",
        total_rows=total_rows,
        valid_rows=valid_rows,
        invalid_rows=invalid_rows,
        inserted_rows=inserted_rows,
        checksum=checksum,
        errors=stored_errors,
        errors_truncated=len(errors or []) > len(stored_errors),
        notes=list(notes or []),
        artifact_storage_key=artifact_key,
        artifact_filename=artifact_filename,
        artifact_size_bytes=artifact_size,
        artifact_sha256=artifact_sha256,
    )
    stale_keys: list[str] = []
    try:
        await session.execute(text("SET LOCAL lock_timeout = '5s'"))
        await session.execute(
            text("SELECT pg_advisory_xact_lock(:classid, hashtext(:pid))").bindparams(
                classid=TRANSFER_JOB_LOCK_CLASSID, pid=str(project_id)
            )
        )
        session.add(job)
        await session.flush()
        stale = (
            (
                await session.execute(
                    select(DataTransferJob)
                    .where(DataTransferJob.project_id == project_id)
                    .order_by(DataTransferJob.created_at.desc(), DataTransferJob.id.desc())
                    .offset(MAX_TRANSFER_JOBS_PER_PROJECT)
                    .with_for_update()
                )
            )
            .scalars()
            .all()
        )
        for old in stale:
            if old.artifact_storage_key:
                stale_keys.append(old.artifact_storage_key)
            await session.delete(old)
        await session.commit()
    except DBAPIError as exc:
        await session.rollback()
        _delete_artifact(storage, artifact_key)
        if _sqlstate(exc) == "55P03":
            raise HTTPException(status_code=503, detail="data transfer history is busy") from exc
        raise
    except Exception:
        await session.rollback()
        _delete_artifact(storage, artifact_key)
        raise
    for key in stale_keys:
        with contextlib.suppress(OSError):
            storage.delete(key)
    return job


async def persist_import_job(
    session: AsyncSession,
    *,
    storage: LocalStorage,
    project_id: uuid.UUID,
    user: User,
    source: str,
    result: CsvImportResult,
) -> DataTransferJob:
    return await persist_transfer_job(
        session,
        storage=storage,
        project_id=project_id,
        user=user,
        direction="import",
        source=source,
        dry_run=result.dry_run,
        total_rows=result.total_rows,
        valid_rows=result.valid,
        invalid_rows=result.invalid,
        inserted_rows=result.inserted,
        checksum=result.checksum,
        errors=[error.model_dump(mode="json") for error in result.errors],
        notes=result.notes,
    )
