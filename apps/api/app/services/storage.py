"""File storage abstraction (expansion Pass 4 PR-M).

v1 ships LocalStorage for development and single-node deployments; the
three-method surface is deliberately small so an object-store backend (S3,
MinIO, …) can slot in without touching the routers.

Keys are SERVER-GENERATED (`{project_id}/{attachment_id}`) — user filenames
are display metadata and never reach the filesystem, so path traversal is
unrepresentable. Writes go to a temp file in the destination directory and
finish with an atomic os.replace; a crash mid-stream leaves only a temp file
that cleanup can sweep, never a half-written final blob.
"""

import contextlib
import os
import tempfile
import uuid
from collections.abc import AsyncIterator
from pathlib import Path


def storage_key(project_id: uuid.UUID, attachment_id: uuid.UUID) -> str:
    return f"{project_id}/{attachment_id}"


def scan(path: Path) -> None:
    """Virus-scan integration seam — intentionally a no-op.

    Accepted risk for the internal deployment: the server never executes
    stored files and downloads are forced to Content-Disposition: attachment.
    Wire a real scanner (e.g. clamd) here before exposing uploads beyond the
    company network."""


class LocalStorage:
    def __init__(self, root: str | os.PathLike[str]) -> None:
        self.root = Path(root).resolve()

    def _path(self, key: str) -> Path:
        # Keys are server-generated, but resolve-and-check anyway so a future
        # caller bug (or a symlinked directory) cannot escape the root.
        p = (self.root / key).resolve()
        if not p.is_relative_to(self.root):
            raise ValueError("storage key escapes the storage root")
        return p

    async def save_stream(self, key: str, chunks: AsyncIterator[bytes]) -> int:
        """Stream to a temp file next to the destination, then atomically
        replace. Returns the byte count. On any error the temp file is removed
        and nothing exists at the final path."""
        dest = self._path(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(dir=dest.parent, prefix=".upload-")
        written = 0
        try:
            with os.fdopen(fd, "wb") as tmp:
                async for chunk in chunks:
                    tmp.write(chunk)
                    written += len(chunk)
            os.chmod(tmp_name, 0o600)
            os.replace(tmp_name, dest)  # atomic within the same directory
        except BaseException:
            with contextlib.suppress(FileNotFoundError):
                os.unlink(tmp_name)
            raise
        scan(dest)
        return written

    def path(self, key: str) -> Path | None:
        p = self._path(key)
        return p if p.is_file() else None

    def delete(self, key: str) -> None:
        with contextlib.suppress(FileNotFoundError):
            self._path(key).unlink()
