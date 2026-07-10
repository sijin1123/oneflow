from pydantic import BaseModel


class OpsDatabase(BaseModel):
    status: str  # "ok" | "error"
    current_revision: str | None


class OpsCounts(BaseModel):
    """Caller-scoped, best-effort (null on failure — v26.1 R1-④)."""

    projects: int | None
    work_packages: int | None


class OpsConfig(BaseModel):
    """Strict allowlist — enums/booleans/numbers only, never secrets (R1-⑤)."""

    auth_mode: str
    ai_summary_enabled: bool
    storage_backend: str
    upload_max_bytes: int
    project_storage_quota_bytes: int


class StatusRead(BaseModel):
    version: str
    database: OpsDatabase
    counts: OpsCounts
    config: OpsConfig
