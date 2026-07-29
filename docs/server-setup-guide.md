# OneFlow server setup guide

This guide rebuilds the current company IDC deployment without relying on an AI session. Commands
run as root unless noted. Never paste private keys, OAuth secrets or database passwords into Git.

## 1. Prerequisites

- Ubuntu 24.04 LTS VM with at least 4 vCPU, 8 GiB RAM and 100 GiB disk
- DNS and a remotely managed Cloudflare Tunnel
- GitHub repository administrator access
- Google OAuth clients with these exact redirect URIs:
  - `https://oneflow.nexvione.net/api/v1/auth/oidc/callback`
  - `https://dev-oneflow.nexvione.net/api/v1/auth/oidc/callback`

[Capture required: Cloudflare Zero Trust -> Networks -> Tunnels -> Public Hostnames]
Capture the two hostnames and origin services; mask the tunnel token and account identifiers.

## 2. Base operating system

Keep the server in UTC and verify NTP with `timedatectl`. Install Git, rsync, jq, unzip, ACL and
Nginx from Ubuntu. Install PostgreSQL 17 from the official PGDG Ubuntu repository. The exact
repository bootstrap is documented by PostgreSQL at <https://www.postgresql.org/download/linux/ubuntu/>.

Before changes, back up `/etc/ssh`, `/etc/ufw`, `/etc/cloudflared`, Nginx and systemd configuration.
Do not start Nginx with its default public port-80 site; the OneFlow configuration listens only on
loopback ports 5173 and 5174.

## 3. Accounts and paths

Create a non-login `oneflow` service account and a separate `github-runner` account. Create the
paths from `docs/environment-matrix.md`. `/etc/oneflow` must be `0750 root:oneflow`; environment
files must be `0640 root:oneflow`; uploads and releases must be `0750 oneflow:oneflow`.
The deploy broker adds a narrow `www-data` ACL only to release-path traversal and the built web
distribution, so Nginx can serve static assets without joining the application group.

## 4. PostgreSQL

Create `oneflow_prod_app` and `oneflow_dev_app` as login roles without superuser, createdb,
createrole or replication privileges. Generate independent random passwords on the server. Create
`oneflow_prod` and `oneflow_dev`, each owned by its matching role. Keep `listen_addresses` on
localhost and host authentication on SCRAM-SHA-256.

Store only the resulting asyncpg DSNs in `/etc/oneflow/prod.database.env` and
`/etc/oneflow/dev.database.env`. Confirm permissions without printing their contents.

## 5. Install OneFlow configuration

From a trusted OneFlow checkout:

```bash
sudo deploy/scripts/install-server-config --cloudflare-tunnel-only
```

This backs up affected configuration, installs root-owned scripts, systemd units, Nginx and
sudoers policy, closes UFW 80/443 rules, and leaves the APIs stopped. Validate with:

```bash
nginx -t
systemd-analyze verify /etc/systemd/system/oneflow-*.service /etc/systemd/system/oneflow-*.timer
ss -lntup
ufw status verbose
```

## 6. OAuth secret

Copy the environment examples to `/etc/oneflow/{dev,prod}.env`, then register a newly rotated secret
from an interactive SSH session:

```bash
sudo /usr/local/sbin/oneflow-set-oauth-secret
```

The tool hides input, confirms it twice and updates both environment files atomically. Do not use
shell history, command arguments, screenshots or chat. Confirm both files are `0640 root:oneflow`.

## 7. GitHub runner

Install the official Linux x64 runner under `/opt/actions-runner/oneflow`, owned by
`github-runner`, and register it to `sijin1123/oneflow` with the label `oneflow-deploy`. Use an
ephemeral registration token and delete it after registration. Keep the runner scoped to this
repository. GitHub's procedure is at
<https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners>.

[Capture required: GitHub -> Settings -> Actions -> Runners]
Show the online `oneflow-deploy` runner; mask registration tokens.

## 8. First deployment and checks

Run the deployment workflow manually with target `dev`. Verify internal and external health, login,
database migration revision, upload/download and logs. Then run `prod`. Only after both pass should
automatic `main` deployment be relied upon.

## 9. Security closeout

After a second key-authenticated SSH session succeeds, install
`deploy/ssh/00-oneflow-hardening.conf`, run `sshd -t`, reload SSH, and verify another new session.
This disables password login and permits root only with keys. Never close the original session
before the second connection succeeds.
