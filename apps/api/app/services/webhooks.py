import asyncio
import base64
import hashlib
import hmac
import ipaddress
import json
import logging
import socket
import time
import uuid
from collections.abc import Awaitable, Callable
from contextlib import suppress
from datetime import datetime, timedelta
from urllib.parse import urlsplit

import httpx
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.models.webhook import WebhookDelivery, WebhookEndpoint
from app.models.work_package import WorkPackage

WebhookSender = Callable[[str, bytes, dict[str, str]], Awaitable[int]]
MAX_ERROR_LENGTH = 500
MAX_PENDING_PER_ENDPOINT = 100
CLAIM_BATCH_SIZE = 50
logger = logging.getLogger("oneflow.webhooks")


async def database_now(session: AsyncSession) -> datetime:
    """Use PostgreSQL's clock for every lease/rate boundary."""
    # PostgreSQL's now() is fixed at transaction start. A sender can take longer
    # than the first retry delay, so use the live, timezone-aware wall clock for
    # leases and retry scheduling instead.
    return (await session.execute(select(func.clock_timestamp()))).scalar_one()


def derive_signing_secret(settings: Settings, endpoint_id: uuid.UUID, version: int) -> str:
    key = (settings.webhook_signing_key or "").encode()
    digest = hmac.new(key, f"{endpoint_id}:{version}".encode(), hashlib.sha256).digest()
    return "ofw_" + base64.urlsafe_b64encode(digest).decode().rstrip("=")


def serialize_payload(payload: dict) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()


def signature_headers(
    settings: Settings,
    endpoint: WebhookEndpoint,
    delivery: WebhookDelivery,
    body: bytes,
    timestamp: int,
) -> dict[str, str]:
    secret = derive_signing_secret(settings, endpoint.id, endpoint.secret_version).encode()
    signature = hmac.new(secret, f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    return {
        "content-type": "application/json",
        "user-agent": "OneFlow-Webhooks/1.0",
        "x-oneflow-event": delivery.event_type,
        "x-oneflow-delivery": str(delivery.id),
        "x-oneflow-timestamp": str(timestamp),
        "x-oneflow-signature": f"sha256={signature}",
    }


def _host_port(url: str) -> tuple[str, int]:
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname:
        raise ValueError("webhook URL must use https")
    if parts.username or parts.password or parts.fragment:
        raise ValueError("webhook URL cannot contain userinfo or fragment")
    try:
        port = parts.port or 443
    except ValueError as exc:
        raise ValueError("webhook URL port is invalid") from exc
    return parts.hostname.lower(), port


async def validate_webhook_url(url: str, settings: Settings) -> str:
    url = url.strip()
    host, port = _host_port(url)
    allowed = set(settings.webhook_allowed_host_list)
    authority = host if port == 443 else f"{host}:{port}"
    if authority not in allowed and not (port == 443 and host in allowed):
        raise ValueError("webhook host is not in ONEFLOW_WEBHOOK_ALLOWED_HOSTS")
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None:
        raise ValueError("webhook URL cannot use an IP literal")

    def resolve() -> set[str]:
        return {item[4][0] for item in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)}

    try:
        addresses = await asyncio.wait_for(asyncio.to_thread(resolve), timeout=2)
    except (OSError, TimeoutError) as exc:
        raise ValueError("webhook host could not be resolved") from exc
    if not addresses:
        raise ValueError("webhook host could not be resolved")
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            raise ValueError("webhook host resolves to a non-public address")
    return url


async def default_sender(url: str, body: bytes, headers: dict[str, str]) -> int:
    timeout = httpx.Timeout(5.0, connect=2.0)
    async with (
        httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client,
        client.stream("POST", url, content=body, headers=headers) as response,
    ):
        return response.status_code


async def attempt_delivery(
    session: AsyncSession,
    endpoint: WebhookEndpoint,
    delivery: WebhookDelivery,
    settings: Settings,
    sender: WebhookSender | None = None,
    *,
    automatic: bool = False,
    claimed: bool = False,
) -> WebhookDelivery:
    claim_token = delivery.lease_token
    if not endpoint.is_active or endpoint.deleted_at is not None:
        status, error, response_status = "skipped", "endpoint is inactive", None
        duration_ms = None
    else:
        status = error = response_status = duration_ms = None
    if not claimed:
        now = await database_now(session)
        claim_token = uuid.uuid4()
        delivery.status = "sending"
        delivery.attempt_count += 1
        delivery.attempted_at = now
        delivery.lease_owner = f"manual:{uuid.uuid4()}"
        delivery.lease_token = claim_token
        delivery.leased_until = now + timedelta(seconds=settings.webhook_lease_seconds)
        delivery.error = None
        delivery.response_status = None
        delivery.duration_ms = None
        await session.commit()
    if status is None:
        body = serialize_payload(delivery.payload)
        headers = signature_headers(settings, endpoint, delivery, body, int(time.time()))
        started = time.monotonic()
        try:
            await validate_webhook_url(endpoint.url, settings)
            response_status = await (sender or default_sender)(endpoint.url, body, headers)
            status = "succeeded" if 200 <= response_status < 300 else "failed"
            error = None if status == "succeeded" else f"HTTP {response_status}"
        except Exception as exc:  # transport failures are durable audit states
            status = "failed"
            error = str(exc)[:MAX_ERROR_LENGTH] or exc.__class__.__name__
            response_status = None
        duration_ms = max(0, round((time.monotonic() - started) * 1000))
    finished_at = await database_now(session)
    next_attempt_at = None
    completed_at = finished_at
    if status == "failed" and automatic:
        if delivery.attempt_count >= settings.webhook_max_attempts:
            status = "dead_letter"
        else:
            status = "retrying"
            delay_seconds = min(300, 2 ** max(0, delivery.attempt_count - 1))
            next_attempt_at = finished_at + timedelta(seconds=delay_seconds)
            completed_at = None
    # Fencing is the final write authority: a reclaimer's token must win over
    # any delayed transport completion from an expired worker.
    result = await session.execute(
        update(WebhookDelivery)
        .where(
            WebhookDelivery.id == delivery.id,
            WebhookDelivery.status == "sending",
            WebhookDelivery.lease_token == claim_token,
        )
        .values(
            status=status,
            error=error,
            response_status=response_status,
            duration_ms=duration_ms,
            next_attempt_at=next_attempt_at,
            completed_at=completed_at,
            lease_owner=None,
            lease_token=None,
            leased_until=None,
        )
    )
    await session.commit()
    await session.refresh(delivery)
    if result.rowcount != 1:
        logger.info("ignored stale webhook completion delivery=%s", delivery.id)
    return delivery


async def enqueue_event(
    session: AsyncSession,
    event_type: str,
    event_id: uuid.UUID,
    payload: dict,
) -> int:
    endpoints = (
        (
            await session.execute(
                select(WebhookEndpoint)
                .where(
                    WebhookEndpoint.is_active.is_(True),
                    WebhookEndpoint.deleted_at.is_(None),
                    WebhookEndpoint.event_types.contains([event_type]),
                )
                .order_by(WebhookEndpoint.id)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    now = await database_now(session)
    for endpoint in endpoints:
        pending = (
            await session.execute(
                select(func.count(WebhookDelivery.id)).where(
                    WebhookDelivery.endpoint_id == endpoint.id,
                    WebhookDelivery.status.in_(["pending", "retrying", "sending"]),
                )
            )
        ).scalar_one()
        saturated = pending >= MAX_PENDING_PER_ENDPOINT
        delivery = WebhookDelivery(
            endpoint_id=endpoint.id,
            event_id=event_id,
            event_type=event_type,
            payload=payload,
            # Preserve saturated events as operator-retryable audit records;
            # silently skipping them would turn backpressure into data loss.
            status="dead_letter" if saturated else "pending",
            error="backpressure: pending delivery limit reached" if saturated else None,
            next_attempt_at=None if saturated else now,
            completed_at=now if saturated else None,
        )
        session.add(delivery)
    return len(endpoints)


def work_package_event_payload(
    wp: WorkPackage,
    event_id: uuid.UUID,
    event_type: str,
    changed_fields: list[str],
    occurred_at: datetime,
) -> dict:
    """Build the one clean-room payload shape used by every WP write fan-in."""
    return {
        "id": str(event_id),
        "event": event_type,
        "occurred_at": occurred_at.isoformat(),
        "data": {
            "id": str(wp.id),
            "project_id": str(wp.project_id),
            "subject": wp.subject,
            "status": wp.status,
            "priority": wp.priority,
            "version": wp.version,
            "changed_fields": sorted(changed_fields),
        },
    }


async def enqueue_work_package_event(
    session: AsyncSession,
    settings: Settings,
    event_type: str,
    wp: WorkPackage,
    changed_fields: list[str],
) -> uuid.UUID | None:
    """Durably enqueue a WP event in the caller's domain transaction.

    The settings guard intentionally fails closed: disabled webhooks have no
    outbox side effects, while enabled callers all share payload construction
    and endpoint fan-out.
    """
    if not settings.webhooks_enabled:
        return None
    event_id = uuid.uuid4()
    occurred_at = await database_now(session)
    await enqueue_event(
        session,
        event_type,
        event_id,
        work_package_event_payload(wp, event_id, event_type, changed_fields, occurred_at),
    )
    return event_id


async def claim_due_delivery_ids(
    session: AsyncSession,
    settings: Settings,
    worker_id: str,
    *,
    event_id: uuid.UUID | None = None,
    limit: int = CLAIM_BATCH_SIZE,
) -> list[uuid.UUID]:
    now = await database_now(session)
    due = and_(
        WebhookDelivery.status.in_(["pending", "retrying"]),
        or_(
            WebhookDelivery.next_attempt_at.is_(None),
            WebhookDelivery.next_attempt_at <= func.clock_timestamp(),
        ),
    )
    expired = and_(
        WebhookDelivery.status == "sending",
        WebhookDelivery.leased_until.is_not(None),
        WebhookDelivery.leased_until <= func.clock_timestamp(),
    )
    stmt = (
        select(WebhookDelivery)
        .where(or_(due, expired), WebhookDelivery.event_type != "oneflow.test")
        .order_by(WebhookDelivery.next_attempt_at.asc().nullsfirst(), WebhookDelivery.created_at)
        .with_for_update(skip_locked=True)
        .limit(limit)
    )
    if event_id is not None:
        stmt = stmt.where(WebhookDelivery.event_id == event_id)
    deliveries = (await session.execute(stmt)).scalars().all()
    for delivery in deliveries:
        delivery.status = "sending"
        delivery.attempt_count += 1
        delivery.attempted_at = now
        delivery.lease_owner = worker_id
        delivery.lease_token = uuid.uuid4()
        delivery.leased_until = now + timedelta(seconds=settings.webhook_lease_seconds)
        delivery.next_attempt_at = None
        delivery.error = None
        delivery.response_status = None
        delivery.duration_ms = None
    # Test deliveries are never auto-sent: a crash leaves an explicit manual
    # recovery record instead of an unexpected external call.
    recovered_tests = (
        (
            await session.execute(
                select(WebhookDelivery)
                .where(
                    WebhookDelivery.event_type == "oneflow.test",
                    WebhookDelivery.status == "sending",
                    WebhookDelivery.leased_until.is_not(None),
                    WebhookDelivery.leased_until <= func.clock_timestamp(),
                )
                .with_for_update(skip_locked=True)
            )
        )
        .scalars()
        .all()
    )
    for delivery in recovered_tests:
        delivery.status = "failed"
        delivery.error = "manual test lease expired; retry manually"
        delivery.completed_at = now
        delivery.lease_owner = None
        delivery.lease_token = None
        delivery.leased_until = None
    await session.commit()
    return [delivery.id for delivery in deliveries]


async def dispatch_due_deliveries(
    sessionmaker: async_sessionmaker[AsyncSession],
    settings: Settings,
    sender: WebhookSender | None = None,
    *,
    event_id: uuid.UUID | None = None,
    limit: int = CLAIM_BATCH_SIZE,
) -> int:
    if not settings.webhooks_enabled:
        return 0
    worker_id = f"worker:{uuid.uuid4()}"
    delivered = 0
    for _ in range(limit):
        async with sessionmaker() as session:
            delivery_ids = await claim_due_delivery_ids(
                session, settings, worker_id, event_id=event_id, limit=1
            )
        if not delivery_ids:
            break
        delivery_id = delivery_ids[0]
        async with sessionmaker() as session:
            delivery = (
                await session.execute(
                    select(WebhookDelivery).where(WebhookDelivery.id == delivery_id)
                )
            ).scalar_one_or_none()
            if (
                delivery is None
                or delivery.status != "sending"
                or delivery.lease_owner != worker_id
            ):
                continue
            endpoint = (
                await session.execute(
                    select(WebhookEndpoint).where(WebhookEndpoint.id == delivery.endpoint_id)
                )
            ).scalar_one()
            await attempt_delivery(
                session,
                endpoint,
                delivery,
                settings,
                sender,
                automatic=True,
                claimed=True,
            )
            delivered += 1
    return delivered


async def dispatch_event(
    sessionmaker: async_sessionmaker[AsyncSession],
    settings: Settings,
    event_id: uuid.UUID,
    sender: WebhookSender | None = None,
) -> None:
    try:
        await dispatch_due_deliveries(
            sessionmaker, settings, sender, event_id=event_id, limit=MAX_PENDING_PER_ENDPOINT
        )
    except Exception:
        logger.exception("webhook background delivery failed")


async def webhook_worker_loop(
    sessionmaker: async_sessionmaker[AsyncSession],
    settings: Settings,
    stop: asyncio.Event,
    sender: WebhookSender | None = None,
) -> None:
    while not stop.is_set():
        try:
            await dispatch_due_deliveries(sessionmaker, settings, sender)
        except Exception:
            logger.exception("webhook delivery worker iteration failed")
        with suppress(TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=settings.webhook_poll_interval_seconds)
