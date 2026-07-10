"""Orphan-blob sweep (expansion PLAN Pass 11 PR-Y).

Contract (v11.1): dry-run by default; delete mode QUARANTINES (move + JSON
manifest, never unlink); `now - mtime <= min_age` is protected (in-flight
upload / DB-snapshot race shield); only `.upload-*` temps and `{uuid}/{uuid}`
blobs are eligible — symlinks and everything else are reported and left alone;
rows with missing blobs are reported only."""

import json
import os
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.services.storage_sweep import QUARANTINE_DIR, SweepReport, sweep_storage

OLD = datetime(2026, 1, 1, tzinfo=UTC).timestamp()


def _touch(path: Path, *, old: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x")
    if old:
        os.utime(path, (OLD, OLD))


def _paths(items) -> list[str]:
    return [i.path for i in items]


def test_dry_run_reports_without_moving(tmp_path):
    live_key = f"{uuid.uuid4()}/{uuid.uuid4()}"
    _touch(tmp_path / live_key)
    orphan_key = f"{uuid.uuid4()}/{uuid.uuid4()}"
    _touch(tmp_path / orphan_key)
    temp = tmp_path / orphan_key.split("/")[0] / ".upload-abc"
    _touch(temp)

    report = sweep_storage(tmp_path, {live_key})
    assert report.dry_run is True
    assert report.quarantine_dir is None
    assert _paths(report.orphan_candidates) == [orphan_key]
    assert _paths(report.temp_candidates) == [str(temp.relative_to(tmp_path))]
    # Nothing actually moved in dry-run.
    assert (tmp_path / orphan_key).exists() and temp.exists()


def test_delete_quarantines_with_manifest_but_never_live_or_recent(tmp_path):
    live_key = f"{uuid.uuid4()}/{uuid.uuid4()}"
    _touch(tmp_path / live_key)
    old_orphan = f"{uuid.uuid4()}/{uuid.uuid4()}"
    _touch(tmp_path / old_orphan)
    fresh_orphan = f"{uuid.uuid4()}/{uuid.uuid4()}"
    _touch(tmp_path / fresh_orphan, old=False)  # just written → protected

    report = sweep_storage(tmp_path, {live_key}, delete=True)
    assert report.dry_run is False
    assert report.errors == []
    # Moved (recoverable), not unlinked; live and fresh files untouched.
    assert not (tmp_path / old_orphan).exists()
    quarantined = tmp_path / report.quarantine_dir / old_orphan
    assert quarantined.exists()
    assert (tmp_path / live_key).exists()
    assert (tmp_path / fresh_orphan).exists()
    assert report.skipped_recent == [fresh_orphan]

    manifest = json.loads((tmp_path / report.quarantine_dir / "manifest.json").read_text())
    assert [i["path"] for i in manifest["orphan_candidates"]] == [old_orphan]

    # A second run leaves the quarantine area alone (operator's domain).
    again = sweep_storage(tmp_path, {live_key}, delete=True)
    assert again.orphan_candidates == [] and again.errors == []
    assert quarantined.exists()


def test_unrecognized_and_symlinks_are_never_touched(tmp_path):
    stray = tmp_path / "notes.txt"
    _touch(stray)
    nested = tmp_path / str(uuid.uuid4()) / "backup.tar"
    _touch(nested)
    outside = tmp_path.parent / f"outside-{uuid.uuid4().hex}.bin"
    _touch(outside)
    link = tmp_path / str(uuid.uuid4()) / str(uuid.uuid4())
    link.parent.mkdir(parents=True, exist_ok=True)
    link.symlink_to(outside)  # uuid/uuid-shaped SYMLINK must still be skipped
    os.utime(link, (OLD, OLD), follow_symlinks=False)

    report = sweep_storage(tmp_path, set(), delete=True)
    assert stray.exists() and nested.exists() and link.is_symlink() and outside.exists()
    assert sorted(report.unrecognized) == sorted(
        ["notes.txt", str(nested.relative_to(tmp_path)), str(link.relative_to(tmp_path))]
    )
    assert report.orphan_candidates == []
    outside.unlink()


def test_missing_blobs_reported_only(tmp_path):
    ghost_key = f"{uuid.uuid4()}/{uuid.uuid4()}"
    report = sweep_storage(tmp_path, {ghost_key}, delete=True)
    assert report.missing_blobs == [ghost_key]

    # A missing root reports every key as missing and moves nothing.
    report = sweep_storage(tmp_path / "nope", {ghost_key}, delete=True)
    assert isinstance(report, SweepReport)
    assert report.missing_blobs == [ghost_key]


def test_min_age_boundary_is_inclusive_protection(tmp_path):
    orphan = f"{uuid.uuid4()}/{uuid.uuid4()}"
    path = tmp_path / orphan
    _touch(path)
    now = datetime(2026, 1, 2, tzinfo=UTC)  # file mtime = 2026-01-01 → age exactly 1 day

    # Exactly min_age old → now - mtime <= min_age → PROTECTED (R1-⑥).
    report = sweep_storage(tmp_path, set(), min_age=timedelta(days=1), delete=True, now=now)
    assert report.skipped_recent == [orphan]
    assert path.exists()

    # One second older than min_age → eligible.
    report = sweep_storage(
        tmp_path, set(), min_age=timedelta(days=1) - timedelta(seconds=1), delete=True, now=now
    )
    assert _paths(report.orphan_candidates) == [orphan]
    assert not path.exists()
    assert (tmp_path / QUARANTINE_DIR).is_dir()
