import hashlib
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import is_member, require_member
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.data_transfer_job import DataTransferJob
from app.models.member import ProjectMember
from app.models.project import Project
from app.models.user import User
from app.schemas.data_transfer_job import DataTransferJobList, DataTransferJobRead
from app.services.storage import LocalStorage

router = APIRouter()


def _read(row: DataTransferJob, project_key: str, project_name: str) -> DataTransferJobRead:
    return DataTransferJobRead(
        id=row.id,
        project_id=row.project_id,
        project_key=project_key,
        project_name=project_name,
        actor_id=row.actor_id,
        actor_name=row.actor_name,
        direction=row.direction,
        source=row.source,
        dry_run=row.dry_run,
        status=row.status,
        total_rows=row.total_rows,
        valid_rows=row.valid_rows,
        invalid_rows=row.invalid_rows,
        inserted_rows=row.inserted_rows,
        checksum=row.checksum,
        errors_truncated=row.errors_truncated,
        notes=row.notes,
        artifact_available=row.artifact_storage_key is not None,
        artifact_filename=row.artifact_filename,
        artifact_size_bytes=row.artifact_size_bytes,
        artifact_sha256=row.artifact_sha256,
        created_at=row.created_at,
    )


@router.get("/data-transfer-jobs", response_model=DataTransferJobList)
async def list_data_transfer_jobs(
    project_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DataTransferJobList:
    visible_projects = select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
    if project_id is not None:
        await require_member(session, project_id, user)
        visible_projects = select(Project.id).where(Project.id == project_id)
    base = (
        select(DataTransferJob, Project.key, Project.name)
        .join(Project, Project.id == DataTransferJob.project_id)
        .where(DataTransferJob.project_id.in_(visible_projects))
    )
    total = (
        await session.execute(select(func.count()).select_from(base.order_by(None).subquery()))
    ).scalar_one()
    rows = (
        await session.execute(
            base.order_by(DataTransferJob.created_at.desc(), DataTransferJob.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return DataTransferJobList(
        items=[_read(job, key, name) for job, key, name in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/data-transfer-jobs/{job_id}/artifact")
async def download_data_transfer_artifact(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> Response:
    job = await session.get(DataTransferJob, job_id)
    if (
        job is None
        or job.artifact_storage_key is None
        or job.artifact_filename is None
        or job.artifact_sha256 is None
        or not await is_member(session, job.project_id, user.id)
    ):
        raise HTTPException(status_code=404, detail="not found")
    path = LocalStorage(settings.storage_dir).path(job.artifact_storage_key)
    if path is None:
        raise HTTPException(status_code=404, detail="not found")
    content = path.read_bytes()
    if hashlib.sha256(content).hexdigest() != job.artifact_sha256:
        raise HTTPException(status_code=409, detail="export artifact integrity check failed")
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": f'attachment; filename="{job.artifact_filename}"',
            "X-OneFlow-Row-Count": str(job.total_rows),
            "X-OneFlow-Checksum": job.checksum,
            "X-OneFlow-Artifact-Sha256": job.artifact_sha256,
        },
    )
