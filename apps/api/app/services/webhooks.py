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
from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import urlsplit

import httpx
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.models.webhook import WebhookDelivery, WebhookEndpoint
from app.models.work_package import WorkPackage


@dataclass(frozen=True)
class ResolvedWebhookTarget:
    """One parse/resolution result used for both validation and transport.

    It deliberately keeps the original authority separate from literal dial
    candidates, preventing a second DNS lookup between policy and connect.
    """

    url: str
    hostname: str
    authority: str
    port: int
    candidates: tuple[str, ...]

    def __str__(self) -> str:
        return self.url


WebhookSender = Callable[[ResolvedWebhookTarget, bytes, dict[str, str]], Awaitable[int]]
MAX_ERROR_LENGTH = 500
MAX_PENDING_PER_ENDPOINT = 100
CLAIM_BATCH_SIZE = 50
WEBHOOK_DELIVERY_DEADLINE_SECONDS = 8.0
WEBHOOK_CONNECT_TIMEOUT_SECONDS = 2.0
NAT64_NETWORKS = (
    ipaddress.ip_network("64:ff9b::/96"),
    ipaddress.ip_network("64:ff9b:1::/48"),
)
logger = logging.getLogger("oneflow.webhooks")


async def database_now(session: AsyncSession) -> datetime:
    """Use PostgreSQL's clock for every lease/rate boundary."""
    # PostgreSQL's now() is fixed at transaction start. A sender can take longer
    # than the first retry delay, so use the live, timezone-aware wall clock for
    # leases and retry scheduling instead.
    return (await session.execute(select(func.clock_timestamp()))).scalar_one()


class SigningKeyUnavailable(RuntimeError):
    pass


def derive_signing_secret(
    settings: Settings, endpoint_id: uuid.UUID, version: int, signing_key_id: str | None = None
) -> str:
    key_id = signing_key_id or settings.webhook_active_signing_key_id_effective
    key_value = settings.webhook_signing_key_for(key_id or "")
    if key_value is None:
        raise SigningKeyUnavailable(f"signing key {key_id!r} is unavailable")
    key = key_value.encode()
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
    secret = derive_signing_secret(
        settings, endpoint.id, delivery.secret_version, delivery.signing_key_id
    ).encode()
    signature = hmac.new(secret, f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    return {
        "content-type": "application/json",
        "user-agent": "OneFlow-Webhooks/1.0",
        "x-oneflow-event": delivery.event_type,
        "x-oneflow-delivery": str(delivery.id),
        "x-oneflow-timestamp": str(timestamp),
        "x-oneflow-signature": f"sha256={signature}",
        "x-oneflow-key-id": delivery.signing_key_id,
        "x-oneflow-secret-version": str(delivery.secret_version),
    }


def _host_port(url: str) -> tuple[str, int, str]:
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname:
        raise ValueError("webhook URL must use https")
    if parts.username or parts.password or parts.fragment:
        raise ValueError("webhook URL cannot contain userinfo or fragment")
    if "%" in parts.hostname:
        raise ValueError("webhook URL cannot use an IP zone")
    try:
        port = parts.port or 443
    except ValueError as exc:
        raise ValueError("webhook URL port is invalid") from exc
    return parts.hostname.lower(), port, parts.netloc


def _interleave_candidates(addresses: set[tuple[int, str]]) -> tuple[str, ...]:
    # Deterministic within family and alternating families avoids a v6-only
    # outage starving viable v4 without multiplying attempts.
    grouped = {socket.AF_INET6: [], socket.AF_INET: []}
    for family, address in addresses:
        grouped[family].append(address)
    for items in grouped.values():
        items.sort()
    result: list[str] = []
    while grouped[socket.AF_INET6] or grouped[socket.AF_INET]:
        for family in (socket.AF_INET6, socket.AF_INET):
            if grouped[family]:
                result.append(grouped[family].pop(0))
    return tuple(result[:8])


def _is_public_webhook_address(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    if not ip.is_global:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None or ip.sixtofour is not None or ip.teredo is not None:
            return False
        if any(ip in network for network in NAT64_NETWORKS):
            return False
    return True


async def validate_webhook_url(url: str, settings: Settings) -> ResolvedWebhookTarget:
    url = url.strip()
    host, port, original_authority = _host_port(url)
    allowed = set(settings.webhook_allowed_host_list)
    allowed_authority = host if port == 443 else f"{host}:{port}"
    if allowed_authority not in allowed and not (port == 443 and host in allowed):
        raise ValueError("webhook host is not in ONEFLOW_WEBHOOK_ALLOWED_HOSTS")
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None:
        raise ValueError("webhook URL cannot use an IP literal")

    def resolve() -> set[tuple[int, str]]:
        return {
            (item[0], item[4][0])
            for item in socket.getaddrinfo(
                host, port, family=socket.AF_UNSPEC, type=socket.SOCK_STREAM
            )
            if item[0] in {socket.AF_INET, socket.AF_INET6}
        }

    try:
        addresses = await asyncio.wait_for(asyncio.to_thread(resolve), timeout=2)
    except (OSError, TimeoutError) as exc:
        raise ValueError("webhook host could not be resolved") from exc
    if not addresses:
        raise ValueError("webhook host could not be resolved")
    for _, address in addresses:
        if not _is_public_webhook_address(address):
            raise ValueError("webhook host resolves to a non-public address")
    candidates = _interleave_candidates(addresses)
    if not candidates:
        raise ValueError("webhook host could not be resolved")
    return ResolvedWebhookTarget(url, host, original_authority, port, candidates)


async def default_sender(
    target: ResolvedWebhookTarget, body: bytes, headers: dict[str, str]
) -> int:
    """Send only to a checked literal, retaining the origin Host and TLS SNI.

    Failover is intentionally limited to connection setup: after a request is
    handed to httpx, retrying another address could duplicate a webhook.
    """
    deadline = time.monotonic() + WEBHOOK_DELIVERY_DEADLINE_SECONDS
    last_error: Exception | None = None
    for literal in target.candidates:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("webhook delivery deadline exceeded")
        dial_url = httpx.URL(target.url).copy_with(host=literal)
        request_headers = {**headers, "host": target.authority}
        timeout = httpx.Timeout(
            min(remaining, 5.0), connect=min(remaining, WEBHOOK_CONNECT_TIMEOUT_SECONDS)
        )
        try:
            async with asyncio.timeout(remaining):
                async with httpx.AsyncClient(
                    timeout=timeout, follow_redirects=False, trust_env=False, http2=False
                ) as client:
                    request = client.build_request(
                        "POST", dial_url, content=body, headers=request_headers
                    )
                    request.extensions["sni_hostname"] = target.hostname
                    response = await client.send(request, stream=True)
                    try:
                        return response.status_code
                    finally:
                        await response.aclose()
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout) as exc:
            last_error = exc
            continue
    raise last_error or TimeoutError("webhook delivery deadline exceeded")


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
        try:
            headers = signature_headers(settings, endpoint, delivery, body, int(time.time()))
        except SigningKeyUnavailable:
            status = "failed"
            error = f"signing_key_unavailable:{delivery.signing_key_id}"[:MAX_ERROR_LENGTH]
            response_status = None
            duration_ms = 0
            automatic = False
            headers = None
        # Resolve only after signing metadata is known to be usable. A missing
        # historical key must cause no DNS or socket activity.
        target = None
        if headers is not None:
            try:
                target = await validate_webhook_url(endpoint.url, settings)
            except Exception as exc:
                status, error, response_status = "failed", str(exc)[:MAX_ERROR_LENGTH], None
        started = time.monotonic()
        try:
            if target is None:
                raise RuntimeError(error or "webhook target validation failed")
            if headers is None:
                raise SigningKeyUnavailable(error or "signing key unavailable")
            response_status = await (sender or default_sender)(target, body, headers)
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
            signing_key_id=endpoint.signing_key_id,
            secret_version=endpoint.secret_version,
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
