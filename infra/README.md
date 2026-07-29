# OneFlow Infrastructure Notes

## Local development

- `compose.yaml` provides PostgreSQL 17 only. Docker Desktop + Compose is
  **local development only** — never a production platform
  (../docs/ONEFLOW_POSTGRESQL_DEPLOYMENT_POLICY.md).
- The API connects exclusively through `ONEFLOW_DATABASE_URL`.

## Probe contract

- `/api/v1/healthz` = liveness (process only, no DB) — use for container liveness.
- `/api/v1/health` = readiness (DB ping, 503 when degraded) — **never** wire this
  as a liveness probe; a transient DB outage must not cause restart loops.

## Production direction

- PostgreSQL: managed service or a dedicated DB server first. A small internal
  Compose deployment of PostgreSQL is allowed only with an explicit backup,
  restore-rehearsal, version-pinning, monitoring and upgrade plan.
- The company IDC deployment uses native PostgreSQL 17 on the same host, bound
  to loopback, with separate `oneflow_prod` and `oneflow_dev` databases. This
  allowed small-server topology follows the operational controls in
  `docs/server-setup-guide.md` and must replicate backups off-host.
- Production application deployment is systemd + Nginx rather than Compose.
  Runtime secrets are received only through root-owned files under
  `/etc/oneflow`; the application still uses `ONEFLOW_DATABASE_URL` as its
  single database entrypoint.
- DB naming rule: never bare `oneflow` outside local dev — use `oneflow_prod`,
  `oneflow_stg` etc. so the seed reset name-guard stays meaningful.
- Backups before launch: daily `pg_dump` at minimum + one rehearsed restore;
  PITR/standby and RTO/RPO are decided in the production deployment PR.
