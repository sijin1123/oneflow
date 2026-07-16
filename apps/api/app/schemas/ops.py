from datetime import datetime
from typing import Literal

from pydantic import BaseModel

OpsCheckStatus = Literal["ok", "warning", "error"]
OpsCheckId = Literal["database", "schema", "storage", "auth"]


class OpsDatabase(BaseModel):
    status: str  # "ok" | "error"
    current_revision: str | None
    expected_revision: str | None
    matches_head: bool | None


class OpsCounts(BaseModel):
    """Caller-scoped, best-effort (null on failure — v26.1 R1-④)."""

    projects: int | None
    work_packages: int | None


class OpsConfig(BaseModel):
    """Strict allowlist — enums/booleans/numbers only, never secrets (R1-⑤)."""

    environment: str
    auth_mode: str
    oidc_provider_count: int
    ai_summary_enabled: bool
    storage_backend: str
    upload_max_bytes: int
    project_storage_quota_bytes: int


class OpsReadinessCheck(BaseModel):
    id: OpsCheckId
    label: str
    status: OpsCheckStatus
    detail: str
    observed: str | None = None
    expected: str | None = None


class OpsReadiness(BaseModel):
    status: OpsCheckStatus
    ok: int
    warnings: int
    errors: int
    generated_at: datetime
    checks: list[OpsReadinessCheck]


class StatusRead(BaseModel):
    version: str
    readiness: OpsReadiness
    database: OpsDatabase
    counts: OpsCounts
    config: OpsConfig
