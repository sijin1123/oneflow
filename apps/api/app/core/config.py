"""Typed settings for OneFlow API.

Startup guards (PLAN §9) live here as validators: a misconfigured process must
fail to boot with an explicit error, never degrade silently.
"""

from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ALLOWED_ENVS = {"development", "test", "staging", "production"}
ALLOWED_AUTH_MODES = {"dev", "oidc"}
ALLOWED_LOG_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR"}
DB_URL_SCHEME = "postgresql+asyncpg://"
# ONEFLOW_ALLOW_DESTRUCTIVE_RESET must be EXACTLY this value to unlock dev-DB reset.
DESTRUCTIVE_RESET_TOKEN = "local-dev-only"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ONEFLOW_", env_file=".env", extra="ignore", case_sensitive=False
    )

    env: str = "development"
    database_url: str = "postgresql+asyncpg://oneflow:oneflow@localhost:5432/oneflow"
    test_database_url: str = "postgresql+asyncpg://oneflow:oneflow@localhost:5432/oneflow_test"
    auth_mode: str = "dev"
    cors_origins: str = "http://localhost:5173"
    log_level: str = "INFO"
    # Strict parse: exactly "true" enables it, everything else stays locked (PLAN §9 table).
    dev_allow_nonlocal: str = "false"
    # Seed --reset unlock token; valid only when it equals DESTRUCTIVE_RESET_TOKEN.
    allow_destructive_reset: str | None = None
    db_pool_size: int = 10
    db_max_overflow: int = 20

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def dev_allow_nonlocal_enabled(self) -> bool:
        return self.dev_allow_nonlocal == "true"

    @property
    def destructive_reset_enabled(self) -> bool:
        return self.allow_destructive_reset == DESTRUCTIVE_RESET_TOKEN

    @model_validator(mode="after")
    def _startup_guards(self) -> "Settings":
        if self.env not in ALLOWED_ENVS:
            raise ValueError(f"ONEFLOW_ENV must be one of {sorted(ALLOWED_ENVS)}, got {self.env!r}")
        if self.auth_mode not in ALLOWED_AUTH_MODES:
            raise ValueError(
                f"ONEFLOW_AUTH_MODE must be one of {sorted(ALLOWED_AUTH_MODES)}, "
                f"got {self.auth_mode!r}"
            )
        # Guard (1): dev auth is forbidden outside development/test.
        if self.env in {"staging", "production"} and self.auth_mode == "dev":
            raise ValueError(
                "ONEFLOW_AUTH_MODE=dev is forbidden when ONEFLOW_ENV is staging/production "
                "(PLAN §9 startup guard)"
            )
        # Guard (2): asyncpg scheme only — ONEFLOW_DATABASE_URL is the single DB entrypoint.
        for name, url in (
            ("ONEFLOW_DATABASE_URL", self.database_url),
            ("ONEFLOW_TEST_DATABASE_URL", self.test_database_url),
        ):
            if not url.startswith(DB_URL_SCHEME):
                raise ValueError(f"{name} must start with {DB_URL_SCHEME!r}")
        # Guard (3): CORS origins must be valid http(s) URLs — fail fast, not at request time.
        for origin in self.cors_origin_list:
            parts = urlsplit(origin)
            if parts.scheme not in {"http", "https"} or not parts.netloc:
                raise ValueError(
                    f"ONEFLOW_CORS_ORIGINS entry is not a valid http(s) URL: {origin!r}"
                )
        if self.log_level not in ALLOWED_LOG_LEVELS:
            raise ValueError(
                f"ONEFLOW_LOG_LEVEL must be one of {sorted(ALLOWED_LOG_LEVELS)}, "
                f"got {self.log_level!r}"
            )
        if self.dev_allow_nonlocal not in {"true", "false"}:
            raise ValueError("ONEFLOW_DEV_ALLOW_NONLOCAL accepts exactly 'true' or 'false'")
        # Guard (4) companion: the non-local escape hatch is dev/test-only (v5.1).
        if self.dev_allow_nonlocal_enabled and self.env not in {"development", "test"}:
            raise ValueError(
                "ONEFLOW_DEV_ALLOW_NONLOCAL=true is only valid when "
                "ONEFLOW_ENV is development/test (PLAN §9 v5.1)"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
