# OneFlow IDC architecture

## Runtime topology

```text
Browser
  -> Cloudflare DNS/Proxy/Tunnel
     -> oneflow.nexvione.net     -> 127.0.0.1:5173 (Nginx prod)
     -> dev-oneflow.nexvione.net -> 127.0.0.1:5174 (Nginx dev)
        -> static React build
        -> /api/* -> 127.0.0.1:8000 (prod) / 127.0.0.1:8001 (dev)
           -> PostgreSQL 17 on localhost:5432
```

The server has no public application listener. Cloudflare Tunnel is the only web ingress.
Production and development use separate processes, releases, environment files, databases,
uploads and schedules. PostgreSQL is intentionally colocated for the first IDC deployment; this
is a single-host availability risk and requires off-host backup replication before business use.

## Server configuration

| Item | Value |
|---|---|
| Location | Company IDC VMware VM |
| OS | Ubuntu 24.04.4 LTS |
| Address | `10.100.100.83` (private) |
| SSH | TCP 22, key authentication |
| Application account | `oneflow` (no login shell) |
| Deployment runner | `github-runner` |
| Reverse proxy | Nginx 1.24, loopback listeners only |
| Process manager | systemd |
| Database | PostgreSQL 17, loopback only, SCRAM-SHA-256 |

## Firewall ports

| Port | Protocol | Purpose | Externally exposed | Allowed source |
|---:|---|---|---|---|
| 22 | TCP | SSH administration | Yes, IDC network policy applies | Current UFW SSH rule |
| 5173 | TCP | Production Tunnel origin | No | loopback only |
| 5174 | TCP | Development Tunnel origin | No | loopback only |
| 8000 | TCP | Production API | No | loopback only |
| 8001 | TCP | Development API | No | loopback only |
| 5432 | TCP | PostgreSQL | No | loopback only |

## Security boundaries

- GitHub-hosted runners run tests; only a repository-scoped self-hosted runner deploys.
- The runner cannot read `/etc/oneflow/*.env`; it may execute only the root-owned deployment broker.
- Application services run as `oneflow`, not root.
- OAuth and database secrets stay in mode `0640` root-owned environment files.
- `ONEFLOW_AUTH_MODE=dev` is never used in the remote development or production environments.
- Application configuration is operator-controlled boot configuration, so it is not exposed in the
  user settings UI. Runtime product policies that already have admin UI remain unchanged.
