import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.user import User
from app.models.webhook import WebhookDelivery, WebhookEndpoint, WebhookSecretRotation
from app.schemas.webhook import (
    WebhookDeliveryList,
    WebhookDeliveryRead,
    WebhookEndpointCreate,
    WebhookEndpointCreated,
    WebhookEndpointList,
    WebhookEndpointRead,
    WebhookEndpointUpdate,
    WebhookRotateSecret,
)
from app.services.webhooks import (
    attempt_delivery,
    database_now,
    derive_signing_secret,
    validate_webhook_url,
)

router = APIRouter()
MANUAL_LIMIT_PER_MINUTE = 5


def _require_admin(user: User) -> None:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="workspace admin required")


def _require_enabled(settings: Settings) -> None:
    if not settings.webhooks_enabled:
        raise HTTPException(status_code=503, detail="webhook delivery is not configured")


async def _validated_url(url: str, settings: Settings) -> str:
    try:
        return (await validate_webhook_url(url, settings)).url
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


async def _endpoint(session: AsyncSession, endpoint_id: uuid.UUID) -> WebhookEndpoint:
    row = (
        await session.execute(
            select(WebhookEndpoint).where(
                WebhookEndpoint.id == endpoint_id, WebhookEndpoint.deleted_at.is_(None)
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    return row


async def _manual_rate_limit(session: AsyncSession, endpoint_id: uuid.UUID) -> None:
    endpoint = (
        await session.execute(
            select(WebhookEndpoint)
            .where(WebhookEndpoint.id == endpoint_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    # Lock plus the database clock makes six concurrent requests share one
    # authoritative window instead of racing application-local timestamps.
    now = await database_now(session)
    if (
        endpoint.manual_window_started_at is None
        or endpoint.manual_window_started_at <= now - timedelta(minutes=1)
    ):
        endpoint.manual_window_started_at = now
        endpoint.manual_attempt_count = 0
    if endpoint.manual_attempt_count >= MANUAL_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=429, detail="manual delivery limit reached; retry in one minute"
        )
    endpoint.manual_attempt_count += 1


@router.get("/webhooks", response_model=WebhookEndpointList)
async def list_webhooks(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> WebhookEndpointList:
    _require_admin(user)
    rows = (
        (
            await session.execute(
                select(WebhookEndpoint)
                .where(WebhookEndpoint.deleted_at.is_(None))
                .order_by(WebhookEndpoint.created_at.desc(), WebhookEndpoint.id.desc())
            )
        )
        .scalars()
        .all()
    )
    rotations = (
        (
            await session.execute(
                select(WebhookSecretRotation)
                .order_by(WebhookSecretRotation.created_at.desc(), WebhookSecretRotation.id.desc())
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    return WebhookEndpointList(
        items=list(rows),
        total=len(rows),
        enabled=settings.webhooks_enabled,
        active_signing_key_id=settings.webhook_active_signing_key_id_effective,
        available_signing_key_ids=list(settings.webhook_signing_key_ids),
        rotations=list(rotations),
    )


@router.post("/webhooks", response_model=WebhookEndpointCreated, status_code=201)
async def create_webhook(
    body: WebhookEndpointCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> WebhookEndpointCreated:
    _require_admin(user)
    _require_enabled(settings)
    url = await _validated_url(body.url, settings)
    row = WebhookEndpoint(
        name=body.name,
        url=url,
        event_types=body.event_types,
        is_active=True,
        secret_version=1,
        signing_key_id=settings.webhook_active_signing_key_id_effective or "legacy-v1",
        created_by=user.id,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return WebhookEndpointCreated(
        item=WebhookEndpointRead.model_validate(row),
        secret=derive_signing_secret(settings, row.id, row.secret_version, row.signing_key_id),
    )


@router.patch("/webhooks/{endpoint_id}", response_model=WebhookEndpointRead)
async def update_webhook(
    endpoint_id: uuid.UUID,
    body: WebhookEndpointUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> WebhookEndpoint:
    _require_admin(user)
    row = await _endpoint(session, endpoint_id)
    changes = body.model_dump(exclude_unset=True)
    if "url" in changes:
        _require_enabled(settings)
        changes["url"] = await _validated_url(changes["url"], settings)
    for key, value in changes.items():
        setattr(row, key, value)
    await session.commit()
    await session.refresh(row)
    return row


@router.delete("/webhooks/{endpoint_id}", status_code=204)
async def delete_webhook(
    endpoint_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    _require_admin(user)
    row = await _endpoint(session, endpoint_id)
    row.is_active = False
    row.deleted_at = datetime.now(UTC)
    await session.commit()
    return Response(status_code=204)


@router.post("/webhooks/{endpoint_id}/rotate-secret", response_model=WebhookEndpointCreated)
async def rotate_webhook_secret(
    endpoint_id: uuid.UUID,
    body: WebhookRotateSecret,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> WebhookEndpointCreated:
    _require_admin(user)
    _require_enabled(settings)
    if body.target_signing_key_id not in settings.webhook_signing_key_ids:
        raise HTTPException(status_code=422, detail="target signing key is not configured")
    row = (
        await session.execute(
            select(WebhookEndpoint)
            .where(WebhookEndpoint.id == endpoint_id, WebhookEndpoint.deleted_at.is_(None))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    if row.secret_version != body.expected_secret_version:
        raise HTTPException(status_code=409, detail="secret version is stale")
    # Version increments even for same-key rotation; the reason is bounded at
    # the public API boundary and no key material is accepted from clients.
    previous_key_id = row.signing_key_id
    previous_version = row.secret_version
    row.signing_key_id = body.target_signing_key_id
    row.secret_version = previous_version + 1
    session.add(
        WebhookSecretRotation(
            endpoint_id=row.id,
            previous_signing_key_id=previous_key_id,
            signing_key_id=row.signing_key_id,
            previous_secret_version=previous_version,
            secret_version=row.secret_version,
            reason=body.reason,
            created_by=user.id,
        )
    )
    await session.commit()
    await session.refresh(row)
    return WebhookEndpointCreated(
        item=WebhookEndpointRead.model_validate(row),
        secret=derive_signing_secret(settings, row.id, row.secret_version, row.signing_key_id),
    )


@router.post("/webhooks/{endpoint_id}/test", response_model=WebhookDeliveryRead)
async def test_webhook(
    endpoint_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> WebhookDelivery:
    _require_admin(user)
    _require_enabled(settings)
    row = await _endpoint(session, endpoint_id)
    await _manual_rate_limit(session, endpoint_id)
    now = await database_now(session)
    event_id = uuid.uuid4()
    delivery = WebhookDelivery(
        endpoint_id=row.id,
        event_id=event_id,
        event_type="oneflow.test",
        # The rate counter and durable claim are one commit. A process crash
        # after that commit is recovered as a manual-retryable failed test.
        status="sending",
        attempt_count=1,
        attempted_at=now,
        lease_owner=f"manual:{uuid.uuid4()}",
        lease_token=uuid.uuid4(),
        leased_until=now + timedelta(seconds=settings.webhook_lease_seconds),
        payload={
            "id": str(event_id),
            "event": "oneflow.test",
            "occurred_at": now.isoformat(),
            "data": {"message": "OneFlow webhook test"},
        },
        signing_key_id=row.signing_key_id,
        secret_version=row.secret_version,
    )
    session.add(delivery)
    await session.commit()
    await session.refresh(delivery)
    sender = getattr(request.app.state, "webhook_sender", None)
    return await attempt_delivery(session, row, delivery, settings, sender, claimed=True)


@router.get("/webhook-deliveries", response_model=WebhookDeliveryList)
async def list_deliveries(
    endpoint_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WebhookDeliveryList:
    _require_admin(user)
    stmt = select(WebhookDelivery)
    if endpoint_id is not None:
        stmt = stmt.where(WebhookDelivery.endpoint_id == endpoint_id)
    rows = (
        (
            await session.execute(
                stmt.order_by(WebhookDelivery.created_at.desc(), WebhookDelivery.id.desc()).limit(
                    limit
                )
            )
        )
        .scalars()
        .all()
    )
    return WebhookDeliveryList(items=list(rows), total=len(rows))


@router.post("/webhook-deliveries/{delivery_id}/retry", response_model=WebhookDeliveryRead)
async def retry_delivery(
    delivery_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> WebhookDelivery:
    _require_admin(user)
    _require_enabled(settings)
    delivery = (
        await session.execute(
            select(WebhookDelivery).where(WebhookDelivery.id == delivery_id).with_for_update()
        )
    ).scalar_one_or_none()
    if delivery is None:
        raise HTTPException(status_code=404, detail="not found")
    if delivery.status == "sending":
        now = await database_now(session)
        if delivery.leased_until is None or delivery.leased_until > now:
            raise HTTPException(status_code=409, detail="delivery is already in progress")
        delivery.status = "failed"
    if delivery.status not in {"failed", "dead_letter"}:
        raise HTTPException(status_code=409, detail="delivery is not retryable")
    row = await _endpoint(session, delivery.endpoint_id)
    await _manual_rate_limit(session, row.id)
    delivery.status = "pending"
    delivery.next_attempt_at = await database_now(session)
    delivery.completed_at = None
    delivery.error = None
    delivery.response_status = None
    delivery.duration_ms = None
    sender = getattr(request.app.state, "webhook_sender", None)
    return await attempt_delivery(session, row, delivery, settings, sender)
