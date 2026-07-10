"""Human-facing operations status surface (Pass 26 PR-AR, PLAN v26.1).

ALWAYS 200 — this page exists to SHOW partial failure, unlike the machine
probes in health.py (whose contracts are unchanged). Counts are scoped to the
CALLER's member projects (R1-①); the response model is a strict allowlist —
no secret can ride along (R1-⑤). The DB revision is reported as a string; the
CI migrate-smoke gate owns code↔schema drift (R1-③).
"""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.member import ProjectMember
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.ops import OpsConfig, OpsCounts, OpsDatabase, StatusRead

router = APIRouter()

APP_VERSION = "0.1.0"  # keep in sync with app.main FastAPI(version=…)


@router.get("/ops/status", response_model=StatusRead)
async def ops_status(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> StatusRead:
    db_status = "ok"
    revision: str | None = None
    projects: int | None = None
    wps: int | None = None
    try:
        revision = (
            await session.execute(text("SELECT version_num FROM alembic_version"))
        ).scalar_one_or_none()
    except Exception:
        db_status = "error"

    if db_status == "ok":
        try:
            member_projects = select(ProjectMember.project_id).where(
                ProjectMember.user_id == user.id
            )
            projects = (
                await session.execute(select(func.count()).select_from(member_projects.subquery()))
            ).scalar_one()
            wps = (
                await session.execute(
                    select(func.count()).where(WorkPackage.project_id.in_(member_projects))
                )
            ).scalar_one()
        except Exception:
            projects = None  # best-effort — the page shows the gap (R1-④)
            wps = None

    return StatusRead(
        version=APP_VERSION,
        database=OpsDatabase(status=db_status, current_revision=revision),
        counts=OpsCounts(projects=projects, work_packages=wps),
        config=OpsConfig(
            auth_mode=settings.auth_mode,
            ai_summary_enabled=settings.ai_summary_enabled,
            storage_backend="local",
            upload_max_bytes=settings.upload_max_bytes,
            project_storage_quota_bytes=settings.project_storage_quota_bytes,
        ),
    )
