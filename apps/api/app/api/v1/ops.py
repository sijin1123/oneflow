"""Human-facing deployment diagnostics (UI-130).

ALWAYS 200 — this page exists to SHOW partial failure, unlike the machine
probes in health.py (whose contracts are unchanged). Counts are scoped to the
CALLER's member projects (R1-①); the response model is a strict allowlist —
no secret, DSN, hostname or filesystem path can ride along. Readiness checks
observe the real database schema and a reversible LocalStorage write without
turning this endpoint into a runtime configuration surface.
"""

import os
import tempfile
from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path

import anyio
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.member import ProjectMember
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.ops import (
    OpsConfig,
    OpsCounts,
    OpsDatabase,
    OpsReadiness,
    OpsReadinessCheck,
    StatusRead,
)

router = APIRouter()

APP_VERSION = "0.1.0"  # keep in sync with app.main FastAPI(version=…)


def _load_expected_revision() -> str | None:
    """Read the packaged Alembic head without depending on the process cwd."""

    try:
        api_root = Path(__file__).resolve().parents[3]
        config = Config()
        config.set_main_option("script_location", str(api_root / "alembic"))
        return ScriptDirectory.from_config(config).get_current_head()
    except Exception:
        # A source-stripped deployment remains observable and reports a warning.
        return None


EXPECTED_DB_REVISION = _load_expected_revision()


def _probe_local_storage(root: str) -> None:
    """Create, flush and delete one private probe file under the configured root."""

    storage_root = Path(root).resolve()
    storage_root.mkdir(parents=True, exist_ok=True)
    if not storage_root.is_dir():
        raise OSError("storage root is not a directory")

    probe: str | None = None
    try:
        fd, probe = tempfile.mkstemp(dir=storage_root, prefix=".readiness-")
        with os.fdopen(fd, "wb") as handle:
            handle.write(b"oneflow-readiness\n")
            handle.flush()
            os.fsync(handle.fileno())
    finally:
        if probe is not None:
            Path(probe).unlink(missing_ok=True)


def _overall_status(checks: list[OpsReadinessCheck]) -> str:
    if any(check.status == "error" for check in checks):
        return "error"
    if any(check.status == "warning" for check in checks):
        return "warning"
    return "ok"


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
    checks: list[OpsReadinessCheck] = []

    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"
        with suppress(Exception):
            await session.rollback()

    checks.append(
        OpsReadinessCheck(
            id="database",
            label="데이터베이스 연결",
            status="ok" if db_status == "ok" else "error",
            detail=(
                "데이터베이스가 요청에 응답합니다."
                if db_status == "ok"
                else "데이터베이스에 연결할 수 없습니다. 연결 설정과 서버 상태를 확인하세요."
            ),
            observed="reachable" if db_status == "ok" else "unreachable",
            expected="reachable",
        )
    )

    if db_status == "ok":
        try:
            revision = (
                await session.execute(text("SELECT version_num FROM alembic_version"))
            ).scalar_one_or_none()
        except Exception:
            with suppress(Exception):
                await session.rollback()

        if EXPECTED_DB_REVISION is None:
            schema_status = "warning"
            schema_detail = "배포 패키지에서 Alembic head를 확인할 수 없습니다."
        elif revision is None:
            schema_status = "error"
            schema_detail = "현재 데이터베이스 리비전을 확인할 수 없습니다."
        elif revision != EXPECTED_DB_REVISION:
            schema_status = "error"
            schema_detail = "데이터베이스 스키마가 애플리케이션 head와 다릅니다."
        else:
            schema_status = "ok"
            schema_detail = "데이터베이스 스키마가 애플리케이션 head와 일치합니다."
    else:
        schema_status = "error"
        schema_detail = "데이터베이스 연결 오류로 스키마를 확인하지 못했습니다."

    checks.append(
        OpsReadinessCheck(
            id="schema",
            label="데이터베이스 스키마",
            status=schema_status,
            detail=schema_detail,
            observed=revision,
            expected=EXPECTED_DB_REVISION,
        )
    )

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

    try:
        await anyio.to_thread.run_sync(_probe_local_storage, settings.storage_dir)
        storage_status = "ok"
        storage_detail = "LocalStorage에 임시 파일을 쓰고 안전하게 정리했습니다."
        storage_observed = "writable"
    except Exception:
        storage_status = "error"
        storage_detail = "LocalStorage에 쓸 수 없습니다. 볼륨 마운트와 권한을 확인하세요."
        storage_observed = "unavailable"
    checks.append(
        OpsReadinessCheck(
            id="storage",
            label="파일 스토리지",
            status=storage_status,
            detail=storage_detail,
            observed=storage_observed,
            expected="writable",
        )
    )

    provider_count = len(settings.enabled_oidc_provider_aliases)
    if settings.auth_mode == "oidc" and provider_count > 0:
        auth_status = "ok"
        auth_detail = f"OIDC 공급자 {provider_count}개가 완전한 구성으로 활성화되어 있습니다."
    elif settings.auth_mode == "oidc":
        auth_status = "error"
        auth_detail = "OIDC 모드에 활성 공급자가 없습니다."
    else:
        auth_status = "warning"
        auth_detail = "개발 인증 모드입니다. 공유 배포 전 OIDC로 전환하세요."
    checks.append(
        OpsReadinessCheck(
            id="auth",
            label="인증 구성",
            status=auth_status,
            detail=auth_detail,
            observed=settings.auth_mode,
            expected="oidc",
        )
    )

    overall = _overall_status(checks)

    return StatusRead(
        version=APP_VERSION,
        readiness=OpsReadiness(
            status=overall,
            ok=sum(check.status == "ok" for check in checks),
            warnings=sum(check.status == "warning" for check in checks),
            errors=sum(check.status == "error" for check in checks),
            generated_at=datetime.now(UTC),
            checks=checks,
        ),
        database=OpsDatabase(
            status=db_status,
            current_revision=revision,
            expected_revision=EXPECTED_DB_REVISION,
            matches_head=(
                revision == EXPECTED_DB_REVISION
                if revision is not None and EXPECTED_DB_REVISION is not None
                else None
            ),
        ),
        counts=OpsCounts(projects=projects, work_packages=wps),
        config=OpsConfig(
            environment=settings.env,
            auth_mode=settings.auth_mode,
            oidc_provider_count=provider_count,
            ai_summary_enabled=settings.ai_summary_enabled,
            storage_backend="local",
            upload_max_bytes=settings.upload_max_bytes,
            project_storage_quota_bytes=settings.project_storage_quota_bytes,
        ),
    )
