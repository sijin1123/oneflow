"""Authenticated users' private profile-image lifecycle."""

import re
import uuid
from collections.abc import AsyncIterator
from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import unquote

from anyio import CapacityLimiter, to_thread
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.user import User
from app.schemas.user import MeRead
from app.services.storage import LocalStorage

router = APIRouter()

PROFILE_IMAGE_TYPES = {
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/webp": "WEBP",
}
PROFILE_IMAGE_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}
PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024
PROFILE_IMAGE_MAX_EDGE = 2048
PROFILE_IMAGE_MAX_PIXELS = 4_000_000
PROFILE_IMAGE_DECODE_LIMITER = CapacityLimiter(1)


def _etag(revision: int) -> str:
    return f'"{revision}"'


def _expected_revision(if_match: str | None) -> int:
    if if_match is None:
        raise HTTPException(status_code=428, detail="If-Match is required")
    value = if_match.strip()
    if value.startswith("W/"):
        raise HTTPException(status_code=422, detail="If-Match requires a strong ETag")
    match = re.fullmatch(r'"([1-9][0-9]*)"', value)
    if match is None:
        raise HTTPException(
            status_code=422,
            detail='If-Match must be one quoted positive revision, for example "1"',
        )
    return int(match.group(1))


def _stale_revision(current_revision: int) -> HTTPException:
    return HTTPException(
        status_code=412,
        detail={"code": "stale_revision", "current_revision": current_revision},
        headers={"ETag": _etag(current_revision)},
    )


def _profile_filename(value: str | None, content_type: str) -> str:
    decoded = unquote(value or "").replace("\\", "/").split("/")[-1].strip()
    decoded = "".join(character for character in decoded if ord(character) >= 32)
    if not decoded:
        return f"profile-image{PROFILE_IMAGE_EXTENSIONS[content_type]}"
    stem = Path(decoded).stem.strip() or "profile-image"
    return f"{stem[:100]}{PROFILE_IMAGE_EXTENSIONS[content_type]}"


async def _bounded_chunks(request: Request) -> AsyncIterator[bytes]:
    total = 0
    async for chunk in request.stream():
        if not chunk:
            continue
        total += len(chunk)
        if total > PROFILE_IMAGE_MAX_BYTES:
            raise HTTPException(status_code=413, detail="profile image cannot exceed 2 MiB")
        yield chunk
    if total == 0:
        raise HTTPException(status_code=422, detail="profile image cannot be empty")


def _inspect_profile_image(path: Path, content_type: str) -> tuple[int, int]:
    try:
        with Image.open(path) as image:
            width, height = image.size
            if (
                image.format != PROFILE_IMAGE_TYPES[content_type]
                or getattr(image, "n_frames", 1) != 1
                or width < 1
                or height < 1
                or width > PROFILE_IMAGE_MAX_EDGE
                or height > PROFILE_IMAGE_MAX_EDGE
                or width * height > PROFILE_IMAGE_MAX_PIXELS
            ):
                raise ValueError("invalid profile image dimensions or format")
            image.load()
            return width, height
    except (OSError, SyntaxError, ValueError, UnidentifiedImageError, Image.DecompressionBombError):
        raise HTTPException(
            status_code=422,
            detail="profile image must be a valid static PNG, JPEG, or WebP image",
        ) from None


async def _locked_user(session: AsyncSession, user_id: uuid.UUID, expected: int) -> User:
    row = (
        await session.execute(
            select(User)
            .where(User.id == user_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if row is None or not row.is_active:
        raise HTTPException(status_code=401, detail="authenticated user is unavailable")
    if row.profile_revision != expected:
        current_revision = row.profile_revision
        await session.rollback()
        raise _stale_revision(current_revision)
    return row


@router.get("/me/profile-image")
async def get_profile_image(
    version: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> Response:
    row = await session.get(User, user.id)
    if (
        row is None
        or row.profile_image_storage_key is None
        or row.profile_image_content_type is None
    ):
        raise HTTPException(status_code=404, detail="profile image is not configured")
    current_version = row.profile_image_storage_key.rsplit("/", 1)[-1]
    if version is None or str(version) != current_version:
        raise HTTPException(status_code=404, detail="profile image version is not current")
    path = LocalStorage(settings.storage_dir).path(row.profile_image_storage_key)
    if path is None:
        raise HTTPException(status_code=404, detail="profile image blob is missing")
    try:
        content = await to_thread.run_sync(path.read_bytes)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="profile image blob is missing") from None
    return Response(
        content=content,
        media_type=row.profile_image_content_type,
        headers={
            "Cache-Control": "private, max-age=31536000, immutable",
            "Content-Disposition": "inline",
            "ETag": f'"profile-image-{current_version}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.put("/me/profile-image", response_model=MeRead)
async def replace_profile_image(
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    x_file_name: str | None = Header(default=None, alias="X-File-Name"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> MeRead:
    expected = _expected_revision(if_match)
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type not in PROFILE_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="profile image must be PNG, JPEG, or WebP")
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > PROFILE_IMAGE_MAX_BYTES:
                raise HTTPException(status_code=413, detail="profile image cannot exceed 2 MiB")
        except ValueError:
            raise HTTPException(status_code=400, detail="invalid Content-Length") from None

    storage = LocalStorage(settings.storage_dir)
    new_key = f"{user.id}/{uuid.uuid4()}"
    try:
        byte_size = await storage.save_stream(new_key, _bounded_chunks(request))
        path = storage.path(new_key)
        if path is None:
            raise HTTPException(status_code=500, detail="profile image write failed")
        width, height = await to_thread.run_sync(
            _inspect_profile_image,
            path,
            content_type,
            limiter=PROFILE_IMAGE_DECODE_LIMITER,
        )
        row = await _locked_user(session, user.id, expected)
        old_key = row.profile_image_storage_key
        row.profile_image_storage_key = new_key
        row.profile_image_content_type = content_type
        row.profile_image_filename = _profile_filename(x_file_name, content_type)
        row.profile_image_width = width
        row.profile_image_height = height
        row.profile_image_byte_size = byte_size
        row.profile_revision += 1
        row.updated_at = datetime.now(UTC)
        await session.commit()
    except BaseException:
        await session.rollback()
        with suppress(OSError):
            storage.delete(new_key)
        raise

    if old_key is not None and old_key != new_key:
        with suppress(OSError):
            storage.delete(old_key)
    response.headers["ETag"] = _etag(row.profile_revision)
    return MeRead.model_validate(row)


@router.delete("/me/profile-image", response_model=MeRead)
async def remove_profile_image(
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> MeRead:
    row = await _locked_user(session, user.id, _expected_revision(if_match))
    old_key = row.profile_image_storage_key
    if old_key is None:
        response.headers["ETag"] = _etag(row.profile_revision)
        return MeRead.model_validate(row)
    row.profile_image_storage_key = None
    row.profile_image_content_type = None
    row.profile_image_filename = None
    row.profile_image_width = None
    row.profile_image_height = None
    row.profile_image_byte_size = None
    row.profile_revision += 1
    row.updated_at = datetime.now(UTC)
    await session.commit()
    with suppress(OSError):
        LocalStorage(settings.storage_dir).delete(old_key)
    response.headers["ETag"] = _etag(row.profile_revision)
    return MeRead.model_validate(row)
