# OneFlow Infrastructure Notes

## Local development

- `compose.yaml` provides PostgreSQL 17 only. Docker Desktop + Compose is
  **local development only** — never a production platform
  (docs/ONEFLOW_POSTGRESQL_DEPLOYMENT_POLICY.md).
- The API connects exclusively through `ONEFLOW_DATABASE_URL`.

## Probe contract

- `/api/v1/healthz` = liveness (process only, no DB) — use for container liveness.
- `/api/v1/health` = readiness (DB ping, 503 when degraded) — **never** wire this
  as a liveness probe; a transient DB outage must not cause restart loops.

## Production direction (future PR)

- PostgreSQL: managed service or a dedicated DB server first. A small internal
  Compose deployment of PostgreSQL is allowed only with an explicit backup,
  restore-rehearsal, version-pinning, monitoring and upgrade plan.
- `compose.production.yaml` (future) will intentionally **omit** the postgres
  service and receive `ONEFLOW_DATABASE_URL` from deployment secrets.
- DB naming rule: never bare `oneflow` outside local dev — use `oneflow_prod`,
  `oneflow_stg` etc. so the seed reset name-guard stays meaningful.
- Backups before launch: daily `pg_dump` at minimum + one rehearsed restore;
  PITR/standby and RTO/RPO are decided in the production deployment PR.
