"""Typed settings for OneFlow API.

Startup guards (PLAN §9) live here as validators: a misconfigured process must
fail to boot with an explicit error, never degrade silently.
"""

import re
from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ALLOWED_ENVS = {"development", "test", "staging", "production"}
ALLOWED_AUTH_MODES = {"dev", "oidc"}
ALLOWED_LOG_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR"}
DB_URL_SCHEME = "postgresql+asyncpg://"
WEBHOOK_LEGACY_KEY_ID = "legacy-v1"
WEBHOOK_KEY_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
# ONEFLOW_ALLOW_DESTRUCTIVE_RESET must be EXACTLY this value to unlock dev-DB reset.
DESTRUCTIVE_RESET_TOKEN = "local-dev-only"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ONEFLOW_",
        env_file=".env",
        extra="ignore",
        case_sensitive=False,
        hide_input_in_errors=True,
    )

    env: str = "development"
    database_url: str = "postgresql+asyncpg://oneflow:oneflow@localhost:5432/oneflow"
    test_database_url: str = "postgresql+asyncpg://oneflow:oneflow@localhost:5432/oneflow_test"
    auth_mode: str = "dev"
    cors_origins: str = "http://localhost:5173"
    log_level: str = "INFO"
    # Strict parse: exactly "true" enables it, everything else stays locked (PLAN §9 table).
    dev_allow_nonlocal: str = "false"
    # Dev-login sessions (Pass 72): OFF = the historical zero-credential auto
    # dev user (cookies IGNORED — deterministic for tests/scripts); exactly
    # "true" = a session cookie is REQUIRED (missing/invalid → 401). Restart
    # to change; never exposed in any settings UI (boot-time config).
    dev_login_required: str = "false"
    # Kept secret so validation/repr paths cannot disclose its value.
    dev_login_password: SecretStr | None = None
    # AI summary feature flag (PLAN §3 Phase 3 AI/RAG). Default OFF; exactly "true"
    # enables the work-package summary endpoint. Uses a local, no-secret provider.
    ai_summary: str = "false"
    # Command palette rollout flag (B-030 Pass 1A). Default OFF for staged
    # rollout; the UI must fail closed unless this is exactly "true".
    command_palette_enabled: str = "false"
    # Workspace webhook delivery is fail-closed. Both a stable signing key and
    # an explicit outbound host allowlist are required before the surface is enabled.
    webhook_signing_key: SecretStr | None = None
    # JSON object supplied by the deployment secret store. Values never leave Settings.
    webhook_signing_keys: dict[str, SecretStr] | None = None
    webhook_active_signing_key_id: str | None = None
    webhook_allowed_hosts: str = ""
    webhook_poll_interval_seconds: float = 5.0
    webhook_lease_seconds: int = 30
    webhook_max_attempts: int = 5
    # Seed --reset unlock token; valid only when it equals DESTRUCTIVE_RESET_TOKEN.
    allow_destructive_reset: str | None = None
    db_pool_size: int = 10
    db_max_overflow: int = 20
    # OIDC Authorization Code + PKCE provider. The redirect URI is the exact
    # callback registered with the IdP; web_origin is the trusted browser
    # origin used after the callback. Cross-host discovery endpoints must be
    # named explicitly in oidc_allowed_hosts (issuer host is always allowed).
    oidc_issuer: str | None = None
    oidc_client_id: str | None = None
    oidc_client_secret: SecretStr | None = None
    oidc_redirect_uri: str | None = None
    oidc_web_origin: str | None = None
    oidc_allowed_hosts: str = ""
    # File uploads (Pass 4 PR-M). Not secrets; restart required to change.
    # Local-dev default — production should point at a dedicated volume.
    storage_dir: str = "var/uploads"
    upload_max_bytes: int = 10_485_760  # 10 MiB per file
    project_storage_quota_bytes: int = 1_073_741_824  # 1 GiB per project

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def dev_allow_nonlocal_enabled(self) -> bool:
        return self.dev_allow_nonlocal == "true"

    @property
    def dev_login_required_enabled(self) -> bool:
        return self.dev_login_required == "true"

    @property
    def ai_summary_enabled(self) -> bool:
        return self.ai_summary == "true"

    @property
    def command_palette_is_enabled(self) -> bool:
        return self.command_palette_enabled == "true"

    @property
    def oidc_allowed_host_list(self) -> list[str]:
        hosts = {
            host.strip().lower() for host in self.oidc_allowed_hosts.split(",") if host.strip()
        }
        issuer_host = urlsplit(self.oidc_issuer or "").netloc.lower()
        if issuer_host:
            hosts.add(issuer_host)
        return sorted(hosts)

    @property
    def webhook_allowed_host_list(self) -> list[str]:
        return [
            host.strip().lower() for host in self.webhook_allowed_hosts.split(",") if host.strip()
        ]

    @property
    def webhooks_enabled(self) -> bool:
        return bool(self.webhook_active_signing_key_id_effective and self.webhook_allowed_host_list)

    @property
    def webhook_active_signing_key_id_effective(self) -> str | None:
        if self.webhook_active_signing_key_id:
            return self.webhook_active_signing_key_id
        return WEBHOOK_LEGACY_KEY_ID if self.webhook_signing_key else None

    @property
    def webhook_signing_key_ids(self) -> tuple[str, ...]:
        keys = set((self.webhook_signing_keys or {}).keys())
        if self.webhook_signing_key:
            keys.add(WEBHOOK_LEGACY_KEY_ID)
        return tuple(sorted(keys))

    def webhook_signing_key_for(self, key_id: str) -> str | None:
        """Return a key for internal signing only; never serialize it."""
        if key_id == WEBHOOK_LEGACY_KEY_ID and self.webhook_signing_key:
            return self.webhook_signing_key.get_secret_value()
        secret = (self.webhook_signing_keys or {}).get(key_id)
        return secret.get_secret_value() if secret is not None else None

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
        # Guard (1b): oidc mode without a complete provider config must fail at
        # boot, not with per-request 500s halfway through a deploy.
        if self.auth_mode == "oidc":
            missing = [
                name
                for name, value in (
                    ("ONEFLOW_OIDC_ISSUER", self.oidc_issuer),
                    ("ONEFLOW_OIDC_CLIENT_ID", self.oidc_client_id),
                    (
                        "ONEFLOW_OIDC_CLIENT_SECRET",
                        self.oidc_client_secret.get_secret_value()
                        if self.oidc_client_secret is not None
                        else None,
                    ),
                    ("ONEFLOW_OIDC_REDIRECT_URI", self.oidc_redirect_uri),
                    ("ONEFLOW_OIDC_WEB_ORIGIN", self.oidc_web_origin),
                )
                if not value
            ]
            if missing:
                raise ValueError("ONEFLOW_AUTH_MODE=oidc requires " + ", ".join(missing))
            parts = urlsplit(self.oidc_issuer or "")
            if parts.scheme != "https" or not parts.netloc or len(self.oidc_issuer or "") > 512:
                raise ValueError("ONEFLOW_OIDC_ISSUER must be an https:// URL")
            if parts.query or parts.fragment or parts.username or parts.password:
                raise ValueError("ONEFLOW_OIDC_ISSUER must not contain credentials or query data")
            redirect = urlsplit(self.oidc_redirect_uri or "")
            if redirect.scheme != "https" or not redirect.netloc:
                raise ValueError("ONEFLOW_OIDC_REDIRECT_URI must be an https:// URL")
            if redirect.query or redirect.fragment or redirect.username or redirect.password:
                raise ValueError(
                    "ONEFLOW_OIDC_REDIRECT_URI must not contain credentials or query data"
                )
            web = urlsplit(self.oidc_web_origin or "")
            if web.scheme != "https" or not web.netloc or web.path not in {"", "/"}:
                raise ValueError("ONEFLOW_OIDC_WEB_ORIGIN must be an https:// origin")
            if web.query or web.fragment or web.username or web.password:
                raise ValueError("ONEFLOW_OIDC_WEB_ORIGIN must be an https:// origin")
            normalized_web_origin = f"{web.scheme}://{web.netloc}"
            if normalized_web_origin not in self.cors_origin_list:
                raise ValueError("ONEFLOW_OIDC_WEB_ORIGIN must be listed in ONEFLOW_CORS_ORIGINS")
            for host in self.oidc_allowed_host_list:
                if (
                    "://" in host
                    or "/" in host
                    or "\\" in host
                    or "@" in host
                    or "?" in host
                    or "#" in host
                    or any(char.isspace() for char in host)
                ):
                    raise ValueError(
                        "ONEFLOW_OIDC_ALLOWED_HOSTS entries must be exact host or host:port values"
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
        if self.dev_login_required not in {"true", "false"}:
            raise ValueError("ONEFLOW_DEV_LOGIN_REQUIRED accepts exactly 'true' or 'false'")
        if self.dev_login_password is not None and self.env not in {"development", "test"}:
            raise ValueError("ONEFLOW_DEV_LOGIN_PASSWORD is only valid in development/test")
        if (
            self.dev_login_password is not None
            and len(self.dev_login_password.get_secret_value()) < 12
        ):
            raise ValueError("ONEFLOW_DEV_LOGIN_PASSWORD must be at least 12 characters")
        if self.dev_login_required_enabled and self.dev_login_password is None:
            raise ValueError("ONEFLOW_DEV_LOGIN_REQUIRED=true requires ONEFLOW_DEV_LOGIN_PASSWORD")
        if self.ai_summary not in {"true", "false"}:
            raise ValueError("ONEFLOW_AI_SUMMARY accepts exactly 'true' or 'false'")
        if self.command_palette_enabled not in {"true", "false"}:
            raise ValueError("ONEFLOW_COMMAND_PALETTE_ENABLED accepts exactly 'true' or 'false'")
        if (
            self.webhook_signing_key is not None
            and len(self.webhook_signing_key.get_secret_value()) < 32
        ):
            raise ValueError("ONEFLOW_WEBHOOK_SIGNING_KEY must be at least 32 characters")
        ring = self.webhook_signing_keys or {}
        for key_id, key in ring.items():
            if not WEBHOOK_KEY_ID_RE.fullmatch(key_id):
                raise ValueError("ONEFLOW_WEBHOOK_SIGNING_KEYS contains an invalid key id")
            if len(key.get_secret_value()) < 32:
                raise ValueError(
                    "ONEFLOW_WEBHOOK_SIGNING_KEYS values must be strings of at least 32 characters"
                )
        legacy_in_ring = ring.get(WEBHOOK_LEGACY_KEY_ID)
        legacy_value = legacy_in_ring.get_secret_value() if legacy_in_ring is not None else None
        configured_legacy = (
            self.webhook_signing_key.get_secret_value() if self.webhook_signing_key else None
        )
        if legacy_value is not None and legacy_value != configured_legacy:
            raise ValueError(
                "ONEFLOW_WEBHOOK_SIGNING_KEYS legacy-v1 must exactly equal "
                "ONEFLOW_WEBHOOK_SIGNING_KEY"
            )
        if ring and not self.webhook_active_signing_key_id:
            raise ValueError(
                "ONEFLOW_WEBHOOK_ACTIVE_SIGNING_KEY_ID is required with a signing key ring"
            )
        active = self.webhook_active_signing_key_id_effective
        if active and active not in self.webhook_signing_key_ids:
            raise ValueError(
                "ONEFLOW_WEBHOOK_ACTIVE_SIGNING_KEY_ID is not configured in the signing key ring"
            )
        for host in self.webhook_allowed_host_list:
            if "://" in host or "/" in host or "@" in host:
                raise ValueError(
                    "ONEFLOW_WEBHOOK_ALLOWED_HOSTS entries must be exact host or host:port values"
                )
        if not 1 <= self.webhook_poll_interval_seconds <= 60:
            raise ValueError("ONEFLOW_WEBHOOK_POLL_INTERVAL_SECONDS must be between 1 and 60")
        if not 30 <= self.webhook_lease_seconds <= 300:
            raise ValueError("ONEFLOW_WEBHOOK_LEASE_SECONDS must be between 30 and 300")
        if not 1 <= self.webhook_max_attempts <= 20:
            raise ValueError("ONEFLOW_WEBHOOK_MAX_ATTEMPTS must be between 1 and 20")
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
