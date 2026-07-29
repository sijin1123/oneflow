# OneFlow operations runbook

## Status and health

```bash
systemctl status oneflow-api@dev oneflow-api@prod nginx postgresql cloudflared
/usr/local/sbin/oneflow-health-check dev external
/usr/local/sbin/oneflow-health-check prod external
systemctl list-timers 'oneflow-*'
```

`/api/v1/healthz` is liveness and never touches the database. `/api/v1/health` is readiness and
returns 503 on a DB failure. Never use readiness as a restart-triggering liveness probe.

## Logs

```bash
journalctl -u oneflow-api@dev -n 200 --no-pager
journalctl -u oneflow-api@prod -n 200 --no-pager
journalctl -u cloudflared -n 100 --no-pager
tail -n 100 /var/log/nginx/oneflow-dev.error.log
tail -n 100 /var/log/nginx/oneflow-prod.error.log
```

The API emits structured logs to journald and masks database credentials. Request bodies,
credentials and emails must not be logged. Recommended hot-log retention is 30 days.

## Service operations

```bash
systemctl restart oneflow-api@dev
systemctl restart oneflow-api@prod
systemctl reload nginx
```

Do not reboot the server for an application deployment. Do not restart production when deploying
development or vice versa.

## Backups

```bash
/usr/local/sbin/oneflow-backup prod manual
/usr/local/sbin/oneflow-backup dev manual
/usr/local/sbin/oneflow-backup both manual
systemctl status oneflow-backup.timer
```

Backups are DB-first and uploads-second. Retention is 14 daily, 8 weekly and 12 monthly generations.
The local backup disk shares the VM failure domain; replicate encrypted backups off-host before
business use. Test a restore at least quarterly.

## Capacity

Initial limits are 50 MiB per file and 20 GiB per project. Alert at 70%, 85% and 95% disk usage.
Change quotas in the target environment file and restart only that target. Nginx
`client_max_body_size` must be at least the application per-file limit.

## Scheduled work

Due alerts run after 00:15 UTC and recurring meeting materialization after 00:30 UTC. Both commands
are idempotent and independently scheduled for dev and prod. Webhook delivery runs inside each API
only when a signing key and exact outbound host allowlist are configured.

## Failure notifications

GitHub Actions notifications are the initial deployment failure channel. Operators must watch
failed backup and timer units through systemd/journal monitoring; SMTP is not configured because
the application currently has no deployment SMTP contract.

## Initial Google administrator

OIDC intentionally does not auto-provision accounts. After the first migration, register the first
active workspace administrator in both isolated databases without creating a password:

```bash
oneflow-provision-user both administrator@bsgone.com 'Administrator Name'
```

The root-only helper validates the email against each environment's configured Google domain and
uses the local PostgreSQL operating-system identity. The first successful Google callback binds the
provider subject to this pre-provisioned account. Add later users through the authenticated admin UI.
