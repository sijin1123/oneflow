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
from datetime import UTC, datetime
from urllib.parse import urlsplit

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.models.webhook import WebhookDelivery, WebhookEndpoint

WebhookSender = Callable[[str, bytes, dict[str, str]], Awaitable[int]]
MAX_ERROR_LENGTH = 500
MAX_PENDING_PER_ENDPOINT = 100
logger = logging.getLogger("oneflow.webhooks")


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
) -> WebhookDelivery:
    if not endpoint.is_active or endpoint.deleted_at is not None:
        delivery.status = "skipped"
        delivery.error = "endpoint is inactive"
        await session.commit()
        return delivery
    delivery.status = "sending"
    delivery.attempt_count += 1
    delivery.attempted_at = datetime.now(UTC)
    delivery.error = None
    await session.commit()

    body = serialize_payload(delivery.payload)
    headers = signature_headers(settings, endpoint, delivery, body, int(time.time()))
    started = time.monotonic()
    try:
        await validate_webhook_url(endpoint.url, settings)
        status_code = await (sender or default_sender)(endpoint.url, body, headers)
        delivery.response_status = status_code
        delivery.status = "succeeded" if 200 <= status_code < 300 else "failed"
        if delivery.status == "failed":
            delivery.error = f"HTTP {status_code}"
    except (
        Exception
    ) as exc:  # bounded audit surface; transport exceptions never escape domain writes
        delivery.status = "failed"
        delivery.error = str(exc)[:MAX_ERROR_LENGTH] or exc.__class__.__name__
        delivery.response_status = None
    delivery.duration_ms = max(0, round((time.monotonic() - started) * 1000))
    await session.commit()
    await session.refresh(delivery)
    return delivery


async def deliver_event_to_all(
    sessionmaker: async_sessionmaker[AsyncSession],
    settings: Settings,
    event_type: str,
    payload: dict,
    sender: WebhookSender | None = None,
) -> None:
    if not settings.webhooks_enabled:
        return
    try:
        async with sessionmaker() as session:
            endpoints = (
                (
                    await session.execute(
                        select(WebhookEndpoint).where(
                            WebhookEndpoint.is_active.is_(True),
                            WebhookEndpoint.deleted_at.is_(None),
                            WebhookEndpoint.event_types.contains([event_type]),
                        )
                    )
                )
                .scalars()
                .all()
            )
            for endpoint in endpoints:
                pending = (
                    (
                        await session.execute(
                            select(WebhookDelivery.id).where(
                                WebhookDelivery.endpoint_id == endpoint.id,
                                WebhookDelivery.status.in_(["pending", "sending"]),
                            )
                        )
                    )
                    .scalars()
                    .all()
                )
                saturated = len(pending) >= MAX_PENDING_PER_ENDPOINT
                delivery = WebhookDelivery(
                    endpoint_id=endpoint.id,
                    event_type=event_type,
                    payload=payload,
                    status="skipped" if saturated else "pending",
                    error="pending delivery limit reached" if saturated else None,
                )
                session.add(delivery)
                await session.commit()
                await session.refresh(delivery)
                if not saturated:
                    await attempt_delivery(session, endpoint, delivery, settings, sender)
    except Exception:
        logger.exception("webhook background delivery failed")
