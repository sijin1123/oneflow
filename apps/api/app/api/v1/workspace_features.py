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
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.user import User
from app.models.workspace_feature_policy import WorkspaceFeaturePolicy
from app.models.workspace_profile import PROJECT_PHASE_KEYS, WorkspaceProfile
from app.schemas.workspace_feature_policy import (
    AiWorkspaceFeatureCapability,
    AiWorkspaceFeaturePolicyRead,
    WorkspaceCapabilitiesRead,
    WorkspaceFeatureCapability,
    WorkspaceFeaturePolicyRead,
    WorkspaceFeaturePolicyUpdate,
)
from app.schemas.workspace_profile import (
    WorkspaceCalendarRead,
    WorkspaceCalendarUpdate,
    WorkspaceIdentityRead,
    WorkspaceProfileRead,
    WorkspaceProfileUpdate,
    WorkspaceProjectPhaseDefinitionCreate,
    WorkspaceProjectPhaseDefinitionRead,
    WorkspaceProjectPhaseDefinitionsRead,
    WorkspaceProjectPhaseDefinitionStored,
    WorkspaceProjectPhaseDefinitionsUpdate,
)
from app.services.project_phase_definitions import (
    create_phase_definition,
    parse_phase_definitions,
    serialize_phase_definitions,
    set_phase_retired,
    update_phase_definitions,
)
from app.services.storage import LocalStorage
from app.services.workspace_features import (
    AI_FEATURE,
    CUSTOMERS_FEATURE,
    INITIATIVES_FEATURE,
    RELEASES_FEATURE,
    WIKI_FEATURE,
    feature_policy,
)

router = APIRouter()

WORKSPACE_LOGO_TYPES = {
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/webp": "WEBP",
}
WORKSPACE_LOGO_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}
WORKSPACE_LOGO_MAX_BYTES = 2 * 1024 * 1024
WORKSPACE_LOGO_MAX_EDGE = 4096
WORKSPACE_LOGO_MAX_PIXELS = 8_000_000
WORKSPACE_LOGO_NAMESPACE = "00000000-0000-0000-0000-000000000001"
WORKSPACE_LOGO_DECODE_LIMITER = CapacityLimiter(1)


def _require_admin(user: User) -> None:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="workspace admin required")


def _read(row: WorkspaceFeaturePolicy) -> WorkspaceFeaturePolicyRead:
    return WorkspaceFeaturePolicyRead(
        feature_key=row.feature_key,
        enabled=row.enabled,
        revision=row.revision,
        updated_by_user_id=row.updated_by_user_id,
        updated_by_name=row.updated_by_name,
        updated_at=row.updated_at,
    )


def _ai_read(row: WorkspaceFeaturePolicy, settings: Settings) -> AiWorkspaceFeaturePolicyRead:
    deployment_enabled = settings.ai_summary_enabled
    return AiWorkspaceFeaturePolicyRead(
        **_read(row).model_dump(),
        deployment_enabled=deployment_enabled,
        effective_enabled=deployment_enabled and row.enabled,
    )


def _etag(revision: int) -> str:
    return f'"{revision}"'


def _profile_read(row: WorkspaceProfile) -> WorkspaceProfileRead:
    return WorkspaceProfileRead(
        id=row.id,
        name=row.name,
        revision=row.revision,
        logo_url=_logo_url(row),
        logo_content_type=row.logo_content_type,
        logo_filename=row.logo_filename,
        logo_width=row.logo_width,
        logo_height=row.logo_height,
        logo_byte_size=row.logo_byte_size,
        updated_by_user_id=row.updated_by_user_id,
        updated_by_name=row.updated_by_name,
        updated_at=row.updated_at,
    )


def _identity_read(row: WorkspaceProfile) -> WorkspaceIdentityRead:
    return WorkspaceIdentityRead(
        name=row.name,
        revision=row.revision,
        logo_url=_logo_url(row),
        logo_content_type=row.logo_content_type,
        logo_filename=row.logo_filename,
        logo_width=row.logo_width,
        logo_height=row.logo_height,
        logo_byte_size=row.logo_byte_size,
    )


def _logo_url(row: WorkspaceProfile) -> str | None:
    if row.logo_storage_key is None:
        return None
    version = row.logo_storage_key.rsplit("/", 1)[-1]
    return f"/api/v1/workspace/logo?version={version}"


def _logo_filename(value: str | None, content_type: str) -> str:
    decoded = unquote(value or "").replace("\\", "/").split("/")[-1].strip()
    decoded = "".join(character for character in decoded if ord(character) >= 32)
    if not decoded:
        return f"workspace-logo{WORKSPACE_LOGO_EXTENSIONS[content_type]}"
    stem = Path(decoded).stem.strip() or "workspace-logo"
    return f"{stem[:100]}{WORKSPACE_LOGO_EXTENSIONS[content_type]}"


async def _bounded_logo_chunks(request: Request) -> AsyncIterator[bytes]:
    total = 0
    async for chunk in request.stream():
        if not chunk:
            continue
        total += len(chunk)
        if total > WORKSPACE_LOGO_MAX_BYTES:
            raise HTTPException(status_code=413, detail="workspace logo cannot exceed 2 MiB")
        yield chunk
    if total == 0:
        raise HTTPException(status_code=422, detail="workspace logo cannot be empty")


def _inspect_workspace_logo(path: Path, content_type: str) -> tuple[int, int]:
    try:
        with Image.open(path) as image:
            width, height = image.size
            if (
                image.format != WORKSPACE_LOGO_TYPES[content_type]
                or getattr(image, "n_frames", 1) != 1
                or width < 1
                or height < 1
                or width > WORKSPACE_LOGO_MAX_EDGE
                or height > WORKSPACE_LOGO_MAX_EDGE
                or width * height > WORKSPACE_LOGO_MAX_PIXELS
            ):
                raise ValueError("invalid workspace logo dimensions or format")
            image.load()
            return width, height
    except (OSError, SyntaxError, ValueError, UnidentifiedImageError, Image.DecompressionBombError):
        raise HTTPException(
            status_code=422,
            detail="workspace logo must be a valid static PNG, JPEG, or WebP image",
        ) from None


async def _locked_profile(
    session: AsyncSession,
    expected: int,
) -> WorkspaceProfile:
    row = (
        await session.execute(
            select(WorkspaceProfile).where(WorkspaceProfile.id == 1).with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=500, detail="workspace profile is missing")
    if row.revision != expected:
        current_revision = row.revision
        await session.rollback()
        raise _stale_revision(current_revision)
    return row


def _touch_profile(row: WorkspaceProfile, user: User) -> None:
    row.revision += 1
    row.updated_by_user_id = user.id
    row.updated_by_name = user.display_name
    row.updated_at = datetime.now(UTC)


def _calendar_read(row: WorkspaceProfile) -> WorkspaceCalendarRead:
    return WorkspaceCalendarRead(
        working_weekdays=row.working_weekdays,
        holidays=row.holidays,
        revision=row.revision,
        updated_by_user_id=row.updated_by_user_id,
        updated_by_name=row.updated_by_name,
        updated_at=row.updated_at,
    )


def _phase_definitions_read(row: WorkspaceProfile) -> WorkspaceProjectPhaseDefinitionsRead:
    try:
        definitions = parse_phase_definitions(row.project_phase_definitions)
    except ValueError as error:
        raise HTTPException(
            status_code=500,
            detail="workspace project phase definitions are invalid",
        ) from error
    return WorkspaceProjectPhaseDefinitionsRead(
        items=[
            WorkspaceProjectPhaseDefinitionRead(
                **definition.model_dump(),
                position=position,
                built_in=definition.key in PROJECT_PHASE_KEYS,
            )
            for position, definition in enumerate(definitions)
        ],
        revision=row.revision,
        updated_by_user_id=row.updated_by_user_id,
        updated_by_name=row.updated_by_name,
        updated_at=row.updated_at,
    )


def _stale_revision(revision: int) -> HTTPException:
    return HTTPException(
        status_code=412,
        detail={"code": "stale_revision", "current_revision": revision},
        headers={"ETag": _etag(revision)},
    )


async def _locked_phase_definitions(
    session: AsyncSession,
    expected: int,
) -> tuple[WorkspaceProfile, list[WorkspaceProjectPhaseDefinitionStored]]:
    row = (
        await session.execute(
            select(WorkspaceProfile).where(WorkspaceProfile.id == 1).with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=500, detail="workspace profile is missing")
    if row.revision != expected:
        current_revision = row.revision
        await session.rollback()
        raise _stale_revision(current_revision)
    try:
        definitions = parse_phase_definitions(row.project_phase_definitions)
    except ValueError as error:
        await session.rollback()
        raise HTTPException(
            status_code=500,
            detail="workspace project phase definitions are invalid",
        ) from error
    return row, definitions


async def _save_phase_definitions(
    *,
    row: WorkspaceProfile,
    definitions: list[WorkspaceProjectPhaseDefinitionStored],
    response: Response,
    session: AsyncSession,
    user: User,
) -> WorkspaceProjectPhaseDefinitionsRead:
    serialized = serialize_phase_definitions(definitions)
    if serialized == row.project_phase_definitions:
        response.headers["ETag"] = _etag(row.revision)
        return _phase_definitions_read(row)
    row.project_phase_definitions = serialized
    row.revision += 1
    row.updated_by_user_id = user.id
    row.updated_by_name = user.display_name
    row.updated_at = datetime.now(UTC)
    await session.commit()
    response.headers["ETag"] = _etag(row.revision)
    return _phase_definitions_read(row)


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


@router.get("/workspace/profile", response_model=WorkspaceIdentityRead)
async def get_workspace_profile(
    response: Response,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceIdentityRead:
    del user
    row = await session.get(WorkspaceProfile, 1)
    if row is None:
        raise HTTPException(status_code=500, detail="workspace profile is missing")
    response.headers["ETag"] = _etag(row.revision)
    return _identity_read(row)


@router.get("/admin/workspace/profile", response_model=WorkspaceProfileRead)
async def get_admin_workspace_profile(
    response: Response,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceProfileRead:
    _require_admin(user)
    row = await session.get(WorkspaceProfile, 1)
    if row is None:
        raise HTTPException(status_code=500, detail="workspace profile is missing")
    response.headers["ETag"] = _etag(row.revision)
    return _profile_read(row)


@router.patch("/admin/workspace/profile", response_model=WorkspaceProfileRead)
async def update_workspace_profile(
    body: WorkspaceProfileUpdate,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceProfileRead:
    _require_admin(user)
    expected = _expected_revision(if_match)
    row = (
        await session.execute(
            update(WorkspaceProfile)
            .where(WorkspaceProfile.id == 1, WorkspaceProfile.revision == expected)
            .values(
                name=body.name,
                revision=WorkspaceProfile.revision + 1,
                updated_by_user_id=user.id,
                updated_by_name=user.display_name,
                updated_at=func.now(),
            )
            .returning(WorkspaceProfile)
        )
    ).scalar_one_or_none()
    if row is None:
        current = await session.get(WorkspaceProfile, 1)
        if current is None:
            await session.rollback()
            raise HTTPException(status_code=500, detail="workspace profile is missing")
        current_revision = current.revision
        await session.rollback()
        raise HTTPException(
            status_code=412,
            detail={"code": "stale_revision", "current_revision": current_revision},
            headers={"ETag": _etag(current_revision)},
        )
    await session.commit()
    response.headers["ETag"] = _etag(row.revision)
    return _profile_read(row)


@router.get("/workspace/logo")
async def get_workspace_logo(
    version: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> Response:
    del user
    row = await session.get(WorkspaceProfile, 1)
    if row is None:
        raise HTTPException(status_code=500, detail="workspace profile is missing")
    if row.logo_storage_key is None or row.logo_content_type is None:
        raise HTTPException(status_code=404, detail="workspace logo is not configured")
    current_version = row.logo_storage_key.rsplit("/", 1)[-1]
    if version is None or str(version) != current_version:
        raise HTTPException(status_code=404, detail="workspace logo version is not current")
    path = LocalStorage(settings.storage_dir).path(row.logo_storage_key)
    if path is None:
        raise HTTPException(status_code=404, detail="workspace logo blob is missing")
    try:
        content = await to_thread.run_sync(path.read_bytes)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="workspace logo blob is missing") from None
    return Response(
        content=content,
        media_type=row.logo_content_type,
        headers={
            "Cache-Control": "private, max-age=31536000, immutable",
            "Content-Disposition": "inline",
            "ETag": f'"workspace-logo-{current_version}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.put("/admin/workspace/logo", response_model=WorkspaceProfileRead)
async def replace_workspace_logo(
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    x_file_name: str | None = Header(default=None, alias="X-File-Name"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> WorkspaceProfileRead:
    _require_admin(user)
    expected = _expected_revision(if_match)
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type not in WORKSPACE_LOGO_TYPES:
        raise HTTPException(status_code=415, detail="workspace logo must be PNG, JPEG, or WebP")
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > WORKSPACE_LOGO_MAX_BYTES:
                raise HTTPException(status_code=413, detail="workspace logo cannot exceed 2 MiB")
        except ValueError:
            raise HTTPException(status_code=400, detail="invalid Content-Length") from None

    storage = LocalStorage(settings.storage_dir)
    new_key = f"{WORKSPACE_LOGO_NAMESPACE}/{uuid.uuid4()}"
    try:
        byte_size = await storage.save_stream(new_key, _bounded_logo_chunks(request))
        path = storage.path(new_key)
        if path is None:
            raise HTTPException(status_code=500, detail="workspace logo write failed")
        width, height = await to_thread.run_sync(
            _inspect_workspace_logo,
            path,
            content_type,
            limiter=WORKSPACE_LOGO_DECODE_LIMITER,
        )
        row = await _locked_profile(session, expected)
        old_key = row.logo_storage_key
        row.logo_storage_key = new_key
        row.logo_content_type = content_type
        row.logo_filename = _logo_filename(x_file_name, content_type)
        row.logo_width = width
        row.logo_height = height
        row.logo_byte_size = byte_size
        _touch_profile(row, user)
        await session.commit()
    except BaseException:
        await session.rollback()
        with suppress(OSError):
            storage.delete(new_key)
        raise

    if old_key is not None and old_key != new_key:
        with suppress(OSError):
            storage.delete(old_key)
    response.headers["ETag"] = _etag(row.revision)
    return _profile_read(row)


@router.delete("/admin/workspace/logo", response_model=WorkspaceProfileRead)
async def remove_workspace_logo(
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> WorkspaceProfileRead:
    _require_admin(user)
    expected = _expected_revision(if_match)
    row = await _locked_profile(session, expected)
    old_key = row.logo_storage_key
    if old_key is None:
        response.headers["ETag"] = _etag(row.revision)
        return _profile_read(row)
    row.logo_storage_key = None
    row.logo_content_type = None
    row.logo_filename = None
    row.logo_width = None
    row.logo_height = None
    row.logo_byte_size = None
    _touch_profile(row, user)
    await session.commit()
    with suppress(OSError):
        LocalStorage(settings.storage_dir).delete(old_key)
    response.headers["ETag"] = _etag(row.revision)
    return _profile_read(row)


@router.get("/workspace/calendar", response_model=WorkspaceCalendarRead)
async def get_workspace_calendar(
    response: Response,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceCalendarRead:
    del user
    row = await session.get(WorkspaceProfile, 1)
    if row is None:
        raise HTTPException(status_code=500, detail="workspace profile is missing")
    response.headers["ETag"] = _etag(row.revision)
    return _calendar_read(row)


@router.patch("/admin/workspace/calendar", response_model=WorkspaceCalendarRead)
async def update_workspace_calendar(
    body: WorkspaceCalendarUpdate,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceCalendarRead:
    _require_admin(user)
    expected = _expected_revision(if_match)
    row = (
        await session.execute(
            update(WorkspaceProfile)
            .where(WorkspaceProfile.id == 1, WorkspaceProfile.revision == expected)
            .values(
                working_weekdays=body.working_weekdays,
                holidays=[value.isoformat() for value in body.holidays],
                revision=WorkspaceProfile.revision + 1,
                updated_by_user_id=user.id,
                updated_by_name=user.display_name,
                updated_at=func.now(),
            )
            .returning(WorkspaceProfile)
        )
    ).scalar_one_or_none()
    if row is None:
        current = await session.get(WorkspaceProfile, 1)
        if current is None:
            await session.rollback()
            raise HTTPException(status_code=500, detail="workspace profile is missing")
        current_revision = current.revision
        await session.rollback()
        raise HTTPException(
            status_code=412,
            detail={"code": "stale_revision", "current_revision": current_revision},
            headers={"ETag": _etag(current_revision)},
        )
    await session.commit()
    response.headers["ETag"] = _etag(row.revision)
    return _calendar_read(row)


@router.get(
    "/workspace/project-phase-definitions",
    response_model=WorkspaceProjectPhaseDefinitionsRead,
)
async def get_workspace_project_phase_definitions(
    response: Response,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceProjectPhaseDefinitionsRead:
    del user
    row = await session.get(WorkspaceProfile, 1)
    if row is None:
        raise HTTPException(status_code=500, detail="workspace profile is missing")
    response.headers["ETag"] = _etag(row.revision)
    return _phase_definitions_read(row)


@router.patch(
    "/admin/workspace/project-phase-definitions",
    response_model=WorkspaceProjectPhaseDefinitionsRead,
)
async def update_workspace_project_phase_definitions(
    body: WorkspaceProjectPhaseDefinitionsUpdate,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceProjectPhaseDefinitionsRead:
    _require_admin(user)
    expected = _expected_revision(if_match)
    row, current = await _locked_phase_definitions(session, expected)
    try:
        definitions = update_phase_definitions(current, body)
    except ValueError as error:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(error)) from error
    return await _save_phase_definitions(
        row=row,
        definitions=definitions,
        response=response,
        session=session,
        user=user,
    )


@router.post(
    "/admin/workspace/project-phase-definitions",
    response_model=WorkspaceProjectPhaseDefinitionsRead,
    status_code=201,
)
async def create_workspace_project_phase_definition(
    body: WorkspaceProjectPhaseDefinitionCreate,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceProjectPhaseDefinitionsRead:
    _require_admin(user)
    expected = _expected_revision(if_match)
    row, current = await _locked_phase_definitions(session, expected)
    try:
        definitions = create_phase_definition(current, body)
    except ValueError as error:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(error)) from error
    return await _save_phase_definitions(
        row=row,
        definitions=definitions,
        response=response,
        session=session,
        user=user,
    )


async def _set_workspace_project_phase_retired(
    phase_key: str,
    *,
    retired: bool,
    response: Response,
    if_match: str | None,
    session: AsyncSession,
    user: User,
) -> WorkspaceProjectPhaseDefinitionsRead:
    _require_admin(user)
    expected = _expected_revision(if_match)
    row, current = await _locked_phase_definitions(session, expected)
    try:
        definitions = set_phase_retired(current, phase_key, retired=retired)
    except KeyError as error:
        await session.rollback()
        raise HTTPException(status_code=404, detail="not found") from error
    except ValueError as error:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(error)) from error
    return await _save_phase_definitions(
        row=row,
        definitions=definitions,
        response=response,
        session=session,
        user=user,
    )


@router.post(
    "/admin/workspace/project-phase-definitions/{phase_key}/retire",
    response_model=WorkspaceProjectPhaseDefinitionsRead,
)
async def retire_workspace_project_phase_definition(
    phase_key: str,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceProjectPhaseDefinitionsRead:
    return await _set_workspace_project_phase_retired(
        phase_key,
        retired=True,
        response=response,
        if_match=if_match,
        session=session,
        user=user,
    )


@router.post(
    "/admin/workspace/project-phase-definitions/{phase_key}/restore",
    response_model=WorkspaceProjectPhaseDefinitionsRead,
)
async def restore_workspace_project_phase_definition(
    phase_key: str,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceProjectPhaseDefinitionsRead:
    return await _set_workspace_project_phase_retired(
        phase_key,
        retired=False,
        response=response,
        if_match=if_match,
        session=session,
        user=user,
    )


@router.get("/workspace/capabilities", response_model=WorkspaceCapabilitiesRead)
async def workspace_capabilities(
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    user: User = Depends(get_current_user),
) -> WorkspaceCapabilitiesRead:
    del user
    wiki = await feature_policy(session)
    ai = await feature_policy(session, AI_FEATURE)
    initiatives = await feature_policy(session, INITIATIVES_FEATURE)
    releases = await feature_policy(session, RELEASES_FEATURE)
    customers = await feature_policy(session, CUSTOMERS_FEATURE)
    deployment_enabled = settings.ai_summary_enabled
    return WorkspaceCapabilitiesRead(
        wiki=WorkspaceFeatureCapability(enabled=wiki.enabled, revision=wiki.revision),
        ai=AiWorkspaceFeatureCapability(
            enabled=ai.enabled,
            revision=ai.revision,
            deployment_enabled=deployment_enabled,
            effective_enabled=deployment_enabled and ai.enabled,
        ),
        initiatives=WorkspaceFeatureCapability(
            enabled=initiatives.enabled,
            revision=initiatives.revision,
        ),
        releases=WorkspaceFeatureCapability(
            enabled=releases.enabled,
            revision=releases.revision,
        ),
        customers=WorkspaceFeatureCapability(
            enabled=customers.enabled,
            revision=customers.revision,
        ),
    )


@router.get(
    "/admin/workspace/features/wiki",
    response_model=WorkspaceFeaturePolicyRead,
)
async def get_wiki_policy(
    response: Response,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceFeaturePolicyRead:
    _require_admin(user)
    row = await feature_policy(session)
    response.headers["ETag"] = _etag(row.revision)
    return _read(row)


@router.patch(
    "/admin/workspace/features/wiki",
    response_model=WorkspaceFeaturePolicyRead,
)
async def update_wiki_policy(
    body: WorkspaceFeaturePolicyUpdate,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceFeaturePolicyRead:
    _require_admin(user)
    expected = _expected_revision(if_match)
    row = (
        await session.execute(
            update(WorkspaceFeaturePolicy)
            .where(
                WorkspaceFeaturePolicy.feature_key == WIKI_FEATURE,
                WorkspaceFeaturePolicy.revision == expected,
            )
            .values(
                enabled=body.enabled,
                revision=WorkspaceFeaturePolicy.revision + 1,
                updated_by_user_id=user.id,
                updated_by_name=user.display_name,
                updated_at=func.now(),
            )
            .returning(WorkspaceFeaturePolicy)
        )
    ).scalar_one_or_none()
    if row is None:
        current = await feature_policy(session)
        current_revision = current.revision
        await session.rollback()
        raise HTTPException(
            status_code=412,
            detail={"code": "stale_revision", "current_revision": current_revision},
            headers={"ETag": _etag(current_revision)},
        )
    await session.commit()
    response.headers["ETag"] = _etag(row.revision)
    return _read(row)


@router.get(
    "/admin/workspace/features/ai",
    response_model=AiWorkspaceFeaturePolicyRead,
)
async def get_ai_policy(
    response: Response,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AiWorkspaceFeaturePolicyRead:
    _require_admin(user)
    row = await feature_policy(session, AI_FEATURE)
    response.headers["ETag"] = _etag(row.revision)
    return _ai_read(row, settings)


@router.patch(
    "/admin/workspace/features/ai",
    response_model=AiWorkspaceFeaturePolicyRead,
)
async def update_ai_policy(
    body: WorkspaceFeaturePolicyUpdate,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AiWorkspaceFeaturePolicyRead:
    _require_admin(user)
    expected = _expected_revision(if_match)
    if body.enabled and not settings.ai_summary_enabled:
        raise HTTPException(
            status_code=409,
            detail={"code": "ai_deployment_disabled", "feature": AI_FEATURE},
        )
    row = (
        await session.execute(
            update(WorkspaceFeaturePolicy)
            .where(
                WorkspaceFeaturePolicy.feature_key == AI_FEATURE,
                WorkspaceFeaturePolicy.revision == expected,
            )
            .values(
                enabled=body.enabled,
                revision=WorkspaceFeaturePolicy.revision + 1,
                updated_by_user_id=user.id,
                updated_by_name=user.display_name,
                updated_at=func.now(),
            )
            .returning(WorkspaceFeaturePolicy)
        )
    ).scalar_one_or_none()
    if row is None:
        current = await feature_policy(session, AI_FEATURE)
        current_revision = current.revision
        await session.rollback()
        raise HTTPException(
            status_code=412,
            detail={"code": "stale_revision", "current_revision": current_revision},
            headers={"ETag": _etag(current_revision)},
        )
    await session.commit()
    response.headers["ETag"] = _etag(row.revision)
    return _ai_read(row, settings)


@router.get(
    "/admin/workspace/features/initiatives",
    response_model=WorkspaceFeaturePolicyRead,
)
async def get_initiatives_policy(
    response: Response,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceFeaturePolicyRead:
    _require_admin(user)
    row = await feature_policy(session, INITIATIVES_FEATURE)
    response.headers["ETag"] = _etag(row.revision)
    return _read(row)


@router.patch(
    "/admin/workspace/features/initiatives",
    response_model=WorkspaceFeaturePolicyRead,
)
async def update_initiatives_policy(
    body: WorkspaceFeaturePolicyUpdate,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceFeaturePolicyRead:
    _require_admin(user)
    expected = _expected_revision(if_match)
    row = (
        await session.execute(
            update(WorkspaceFeaturePolicy)
            .where(
                WorkspaceFeaturePolicy.feature_key == INITIATIVES_FEATURE,
                WorkspaceFeaturePolicy.revision == expected,
            )
            .values(
                enabled=body.enabled,
                revision=WorkspaceFeaturePolicy.revision + 1,
                updated_by_user_id=user.id,
                updated_by_name=user.display_name,
                updated_at=func.now(),
            )
            .returning(WorkspaceFeaturePolicy)
        )
    ).scalar_one_or_none()
    if row is None:
        current = await feature_policy(session, INITIATIVES_FEATURE)
        current_revision = current.revision
        await session.rollback()
        raise HTTPException(
            status_code=412,
            detail={"code": "stale_revision", "current_revision": current_revision},
            headers={"ETag": _etag(current_revision)},
        )
    await session.commit()
    response.headers["ETag"] = _etag(row.revision)
    return _read(row)


@router.get(
    "/admin/workspace/features/releases",
    response_model=WorkspaceFeaturePolicyRead,
)
async def get_releases_policy(
    response: Response,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceFeaturePolicyRead:
    _require_admin(user)
    row = await feature_policy(session, RELEASES_FEATURE)
    response.headers["ETag"] = _etag(row.revision)
    return _read(row)


@router.patch(
    "/admin/workspace/features/releases",
    response_model=WorkspaceFeaturePolicyRead,
)
async def update_releases_policy(
    body: WorkspaceFeaturePolicyUpdate,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceFeaturePolicyRead:
    _require_admin(user)
    expected = _expected_revision(if_match)
    row = (
        await session.execute(
            update(WorkspaceFeaturePolicy)
            .where(
                WorkspaceFeaturePolicy.feature_key == RELEASES_FEATURE,
                WorkspaceFeaturePolicy.revision == expected,
            )
            .values(
                enabled=body.enabled,
                revision=WorkspaceFeaturePolicy.revision + 1,
                updated_by_user_id=user.id,
                updated_by_name=user.display_name,
                updated_at=func.now(),
            )
            .returning(WorkspaceFeaturePolicy)
        )
    ).scalar_one_or_none()
    if row is None:
        current = await feature_policy(session, RELEASES_FEATURE)
        current_revision = current.revision
        await session.rollback()
        raise HTTPException(
            status_code=412,
            detail={"code": "stale_revision", "current_revision": current_revision},
            headers={"ETag": _etag(current_revision)},
        )
    await session.commit()
    response.headers["ETag"] = _etag(row.revision)
    return _read(row)


@router.get(
    "/admin/workspace/features/customers",
    response_model=WorkspaceFeaturePolicyRead,
)
async def get_customers_policy(
    response: Response,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceFeaturePolicyRead:
    _require_admin(user)
    row = await feature_policy(session, CUSTOMERS_FEATURE)
    response.headers["ETag"] = _etag(row.revision)
    return _read(row)


@router.patch(
    "/admin/workspace/features/customers",
    response_model=WorkspaceFeaturePolicyRead,
)
async def update_customers_policy(
    body: WorkspaceFeaturePolicyUpdate,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceFeaturePolicyRead:
    _require_admin(user)
    expected = _expected_revision(if_match)
    row = (
        await session.execute(
            update(WorkspaceFeaturePolicy)
            .where(
                WorkspaceFeaturePolicy.feature_key == CUSTOMERS_FEATURE,
                WorkspaceFeaturePolicy.revision == expected,
            )
            .values(
                enabled=body.enabled,
                revision=WorkspaceFeaturePolicy.revision + 1,
                updated_by_user_id=user.id,
                updated_by_name=user.display_name,
                updated_at=func.now(),
            )
            .returning(WorkspaceFeaturePolicy)
        )
    ).scalar_one_or_none()
    if row is None:
        current = await feature_policy(session, CUSTOMERS_FEATURE)
        current_revision = current.revision
        await session.rollback()
        raise HTTPException(
            status_code=412,
            detail={"code": "stale_revision", "current_revision": current_revision},
            headers={"ETag": _etag(current_revision)},
        )
    await session.commit()
    response.headers["ETag"] = _etag(row.revision)
    return _read(row)
