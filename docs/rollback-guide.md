# OneFlow rollback and recovery

## Application rollback

List releases and the current target:

```bash
readlink -f /opt/oneflow/prod/current
find /opt/oneflow/prod/releases -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort
```

Select an existing release explicitly, create a temporary symlink, atomically replace `current`,
restart the matching service and run health checks. Repeat with `dev` paths only for development.
Never point one environment at the other environment's release.

The automated deploy script performs this code rollback when health fails. It deliberately does
not downgrade Alembic. If a migration is incompatible with the previous release, stop and restore
both database and uploads from the same pre-deploy backup instead of forcing a code-only rollback.

## Database and uploads restore

1. Stop only the target API.
2. Preserve the failed database and upload directory before replacement.
3. Verify `SHA256SUMS` in the selected backup directory.
4. Restore the PostgreSQL custom dump into the matching environment database.
5. Restore `uploads.tar.gz` into the matching upload directory.
6. Run `alembic current`, start the API, then run internal and external health checks.
7. Verify login, a representative project query, and an attachment download.

Do not restore `oneflow_dev` into production or reuse credentials across environments. A recovery
is not complete until an attachment row/blob consistency sweep reports no missing blobs.

## Configuration rollback

Server installation creates `/root/oneflow-config-backup-<UTC timestamp>` and the first inventory
created `/root/oneflow-preinstall-backup-<UTC timestamp>`. Restore exact files from those backups,
validate Nginx or SSH syntax, and reload rather than reboot. Keep an existing SSH session open while
rolling back SSH configuration.
