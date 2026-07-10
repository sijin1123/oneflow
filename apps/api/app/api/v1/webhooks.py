import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.user import User
from app.models.webhook import WebhookDelivery, WebhookEndpoint
from app.schemas.webhook import (
    WebhookDeliveryList,
    WebhookDeliveryRead,
    WebhookEndpointCreate,
    WebhookEndpointCreated,
    WebhookEndpointList,
    WebhookEndpointRead,
    WebhookEndpointUpdate,
)
from app.services.webhooks import attempt_delivery, derive_signing_secret, validate_webhook_url

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
        return await validate_webhook_url(url, settings)
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
    since = datetime.now(UTC) - timedelta(minutes=1)
    count = (
        await session.execute(
            select(func.count(WebhookDelivery.id)).where(
                WebhookDelivery.endpoint_id == endpoint_id,
                WebhookDelivery.created_at >= since,
            )
        )
    ).scalar_one()
    if count >= MANUAL_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=429, detail="manual delivery limit reached; retry in one minute"
        )


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
    return WebhookEndpointList(items=list(rows), total=len(rows), enabled=settings.webhooks_enabled)


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
        created_by=user.id,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return WebhookEndpointCreated(
        item=WebhookEndpointRead.model_validate(row),
        secret=derive_signing_secret(settings, row.id, row.secret_version),
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
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> WebhookEndpointCreated:
    _require_admin(user)
    _require_enabled(settings)
    row = await _endpoint(session, endpoint_id)
    row.secret_version += 1
    await session.commit()
    await session.refresh(row)
    return WebhookEndpointCreated(
        item=WebhookEndpointRead.model_validate(row),
        secret=derive_signing_secret(settings, row.id, row.secret_version),
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
    delivery = WebhookDelivery(
        endpoint_id=row.id,
        event_type="oneflow.test",
        status="pending",
        payload={
            "id": str(uuid.uuid4()),
            "event": "oneflow.test",
            "occurred_at": datetime.now(UTC).isoformat(),
            "data": {"message": "OneFlow webhook test"},
        },
    )
    session.add(delivery)
    await session.commit()
    await session.refresh(delivery)
    sender = getattr(request.app.state, "webhook_sender", None)
    return await attempt_delivery(session, row, delivery, settings, sender)


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
        raise HTTPException(status_code=409, detail="delivery is already in progress")
    row = await _endpoint(session, delivery.endpoint_id)
    await _manual_rate_limit(session, row.id)
    retry = WebhookDelivery(
        endpoint_id=row.id,
        event_type=delivery.event_type,
        status="pending",
        payload=delivery.payload,
    )
    session.add(retry)
    await session.commit()
    await session.refresh(retry)
    sender = getattr(request.app.state, "webhook_sender", None)
    return await attempt_delivery(session, row, retry, settings, sender)
