# OneFlow deployment guide

## Automatic flow

```text
feature branch -> pull request -> required CI -> main merge
  -> hosted CI succeeds
  -> self-hosted IDC deployment job
  -> build and deploy dev
  -> internal and external health gate
  -> build and deploy prod
  -> internal and external health gate
```

The deploy workflow reacts only to a successful `push` CI run on `main`; weekly scheduled CI does
not redeploy. Concurrency is serialized and in-progress deployments are not cancelled.

## Manual deployment

Use GitHub Actions -> deploy -> Run workflow and select `dev`, `prod` or `both`. Manual deployment
always resolves the latest `main` SHA through the GitHub API; a feature branch cannot be deployed.

## Release behavior

The root-owned deployment broker validates the target, full commit SHA, checkout and web build. It
copies into a new timestamped release, creates the locked Python environment, backs up the target,
runs `alembic upgrade head`, atomically changes `current`, restarts only that API, and runs
liveness, readiness, OIDC-config and web checks. Five releases are retained.

If health fails, the code symlink returns to the previous release. Database migrations are not
automatically downgraded; migrations merged to `main` must remain backward-compatible with the
previous application release.

## GitHub and environment changes

- New workflow: `.github/workflows/deploy.yml`
- Self-hosted label: `oneflow-deploy`
- No production secret is stored in GitHub because the runner cannot read server environment files.
- `VITE_ONEFLOW_API_BASE_URL` is a public build-time URL and is set separately for each build.
- All runtime setting changes require API restart. No new user-adjustable setting UI is introduced.
