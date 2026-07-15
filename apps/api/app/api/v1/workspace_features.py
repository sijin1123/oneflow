import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Response
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
from app.services.workspace_features import (
    AI_FEATURE,
    CUSTOMERS_FEATURE,
    INITIATIVES_FEATURE,
    RELEASES_FEATURE,
    WIKI_FEATURE,
    feature_policy,
)

router = APIRouter()


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
        updated_by_user_id=row.updated_by_user_id,
        updated_by_name=row.updated_by_name,
        updated_at=row.updated_at,
    )


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
    return WorkspaceIdentityRead(name=row.name, revision=row.revision)


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
