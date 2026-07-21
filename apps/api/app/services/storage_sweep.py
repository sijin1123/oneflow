"""Orphan-blob sweep for the local storage root (expansion Pass 11 PR-Y).

The storage contract (PR #70) can strand two kinds of files: `.upload-*` temp
files from a crashed stream, and final blobs whose owning database row is gone (the
row delete commits first; a crash before the blob delete leaves the blob — the
safe direction, but it accumulates). The sweep handles both, under hard safety
rails (PLAN v11.1 R1 판정):

- DRY-RUN BY DEFAULT — candidates are reported, nothing moves.
- delete mode QUARANTINES (moves to `<root>/.quarantine/<runstamp>/` and writes
  a JSON manifest) instead of unlinking — recoverable until an operator purges.
- files younger than `min_age` (now - mtime <= min_age) are NEVER touched: an
  in-flight upload's temp file and a just-committed row whose key snapshot
  predates it both look like orphans for a moment.
- only `.upload-*` temps and paths shaped like the server-generated
  `{owner_uuid}/{object_uuid}` key are eligible; symlinks and anything
  else are reported as unrecognized and left alone.
- rows whose blob is MISSING are reported only — restoring or deleting data is
  an operator decision, never the sweep's.

This module is local-storage-only by design; the report speaks in storage keys
and relative paths, so a future object-store backend can reuse the semantics.

Run: `uv run python -m app.services.storage_sweep [--delete] [--min-age-hours N]
[--json]` (or `make api-sweep-blobs` / `api-sweep-blobs-delete`). In delete
mode the CLI re-queries the DB after scanning and only quarantines files absent
from BOTH snapshots. Exit code 1 if any move failed.
"""

import argparse
import asyncio
import json
import sys
import uuid
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

TEMP_PREFIX = ".upload-"
QUARANTINE_DIR = ".quarantine"


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


@dataclass
class SweepItem:
    path: str  # relative to the storage root
    reason: str  # 'temp' | 'orphan'
    size: int
    mtime: str  # ISO-8601 UTC


@dataclass
class SweepReport:
    dry_run: bool = True
    quarantine_dir: str | None = None  # set in delete mode
    temp_candidates: list[SweepItem] = field(default_factory=list)
    orphan_candidates: list[SweepItem] = field(default_factory=list)
    missing_blobs: list[str] = field(default_factory=list)
    skipped_recent: list[str] = field(default_factory=list)
    unrecognized: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def sweep_storage(
    root: str | Path,
    known_keys: set[str],
    *,
    min_age: timedelta = timedelta(hours=24),
    delete: bool = False,
    now: datetime | None = None,
) -> SweepReport:
    """Pure sweep over the storage root. `known_keys` is the full set of live
    storage keys referenced by attachments, exports, workspace logos, and profile images.
    In delete mode candidates are MOVED under
    `<root>/.quarantine/<runstamp>/` (never unlinked); failures land in
    report.errors and leave the file in place."""
    root_path = Path(root).resolve()
    moment = now or datetime.now(UTC)
    report = SweepReport(dry_run=not delete)
    if not root_path.is_dir():
        report.missing_blobs = sorted(known_keys)
        return report

    quarantine_root: Path | None = None
    if delete:
        quarantine_root = root_path / QUARANTINE_DIR / moment.strftime("%Y%m%dT%H%M%SZ")
        report.quarantine_dir = str(quarantine_root.relative_to(root_path))

    seen_keys: set[str] = set()
    for path in sorted(root_path.rglob("*")):
        rel = path.relative_to(root_path)
        if rel.parts and rel.parts[0] == QUARANTINE_DIR:
            continue  # previously quarantined files are the operator's domain
        if path.is_symlink():
            # Never follow or move links — a link into (or out of) the root is
            # not something the sweep may judge (R1-③).
            report.unrecognized.append(str(rel))
            continue
        if not path.is_file():
            continue
        if not path.resolve().is_relative_to(root_path):
            report.unrecognized.append(str(rel))
            continue
        parts = rel.parts

        if path.name.startswith(TEMP_PREFIX):
            reason = "temp"
        elif len(parts) == 2 and _is_uuid(parts[0]) and _is_uuid(parts[1]):
            key = f"{parts[0]}/{parts[1]}"
            seen_keys.add(key)
            if key in known_keys:
                continue  # live blob
            reason = "orphan"
        else:
            report.unrecognized.append(str(rel))
            continue

        stat = path.stat()
        mtime = datetime.fromtimestamp(stat.st_mtime, tz=UTC)
        # Boundary contract (R1-⑥): now - mtime <= min_age → protected.
        if moment - mtime <= min_age:  # equivalently: mtime >= cutoff
            report.skipped_recent.append(str(rel))
            continue

        if quarantine_root is not None:
            dest = quarantine_root / rel
            try:
                dest.parent.mkdir(parents=True, exist_ok=True)
                path.rename(dest)
            except OSError as exc:
                report.errors.append(f"{rel}: {exc}")
                continue
        item = SweepItem(path=str(rel), reason=reason, size=stat.st_size, mtime=mtime.isoformat())
        (report.temp_candidates if reason == "temp" else report.orphan_candidates).append(item)

    report.missing_blobs = sorted(known_keys - seen_keys)

    if quarantine_root is not None and (report.temp_candidates or report.orphan_candidates):
        manifest = quarantine_root / "manifest.json"
        try:
            manifest.parent.mkdir(parents=True, exist_ok=True)
            manifest.write_text(json.dumps(asdict(report), ensure_ascii=False, indent=2))
        except OSError as exc:
            report.errors.append(f"manifest: {exc}")
    return report


def _print_report(report: SweepReport, *, min_age: timedelta) -> None:
    mode = "DRY-RUN (nothing moved)" if report.dry_run else f"QUARANTINE → {report.quarantine_dir}"
    verb = "would quarantine" if report.dry_run else "quarantined"
    print(f"storage sweep — {mode}, min age {min_age}")
    print(f"  temp files {verb}: {len(report.temp_candidates)}")
    for item in report.temp_candidates:
        print(f"    {item.path}")
    print(f"  orphan blobs {verb}: {len(report.orphan_candidates)}")
    for item in report.orphan_candidates:
        print(f"    {item.path}")
    print(f"  skipped (younger than min age): {len(report.skipped_recent)}")
    print(f"  unrecognized paths (left alone): {len(report.unrecognized)}")
    for p in report.unrecognized:
        print(f"    {p}")
    print(f"  rows with MISSING blobs (report only): {len(report.missing_blobs)}")
    for k in report.missing_blobs:
        print(f"    {k}")
    for err in report.errors:
        print(f"  ERROR: {err}")


async def _fetch_keys_from_connection(conn) -> set[str]:
    from sqlalchemy import select

    from app.models.activity import Activity
    from app.models.attachment import Attachment
    from app.models.comment import WorkPackageComment
    from app.models.data_transfer_job import DataTransferJob
    from app.models.user import User
    from app.models.workspace_profile import WorkspaceProfile

    attachment_keys = set(
        (
            await conn.execute(
                select(Attachment.storage_key).where(Attachment.storage_key.is_not(None))
            )
        )
        .scalars()
        .all()
    )
    transfer_keys = set(
        (
            await conn.execute(
                select(DataTransferJob.artifact_storage_key).where(
                    DataTransferJob.artifact_storage_key.is_not(None)
                )
            )
        )
        .scalars()
        .all()
    )
    workspace_logo_keys = set(
        (
            await conn.execute(
                select(WorkspaceProfile.logo_storage_key).where(
                    WorkspaceProfile.logo_storage_key.is_not(None)
                )
            )
        )
        .scalars()
        .all()
    )
    profile_image_keys = set(
        (
            await conn.execute(
                select(User.profile_image_storage_key).where(
                    User.profile_image_storage_key.is_not(None)
                )
            )
        )
        .scalars()
        .all()
    )
    comment_actor_image_keys = set(
        (
            await conn.execute(
                select(WorkPackageComment.author_profile_image_storage_key).where(
                    WorkPackageComment.author_profile_image_storage_key.is_not(None)
                )
            )
        )
        .scalars()
        .all()
    )
    activity_actor_image_keys = set(
        (
            await conn.execute(
                select(Activity.actor_profile_image_storage_key).where(
                    Activity.actor_profile_image_storage_key.is_not(None)
                )
            )
        )
        .scalars()
        .all()
    )
    return (
        attachment_keys
        | transfer_keys
        | workspace_logo_keys
        | profile_image_keys
        | comment_actor_image_keys
        | activity_actor_image_keys
    )


async def _fetch_keys() -> set[str]:
    from sqlalchemy.ext.asyncio import create_async_engine

    from app.core.config import get_settings

    engine = create_async_engine(get_settings().database_url)
    try:
        async with engine.connect() as conn:
            return await _fetch_keys_from_connection(conn)
    finally:
        await engine.dispose()


async def _main() -> int:
    parser = argparse.ArgumentParser(description="Sweep orphan blobs from the storage root.")
    parser.add_argument(
        "--delete", action="store_true", help="quarantine candidates (default: dry-run)"
    )
    parser.add_argument("--min-age-hours", type=float, default=24.0)
    parser.add_argument("--json", action="store_true", help="machine-readable report on stdout")
    args = parser.parse_args()

    from app.core.config import get_settings

    root = get_settings().storage_dir
    min_age = timedelta(hours=args.min_age_hours)
    keys = await _fetch_keys()
    if args.delete:
        # Two-snapshot confirmation (R1-②): rows committed between the first
        # fetch and the move must survive — union both key sets.
        keys |= await _fetch_keys()
    report = sweep_storage(root, keys, min_age=min_age, delete=args.delete)

    if args.json:
        print(json.dumps(asdict(report), ensure_ascii=False, indent=2))
    else:
        _print_report(report, min_age=min_age)
    return 1 if report.errors else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_main()))
