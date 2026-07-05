"""ASGI middlewares: request-id, request logging, global 500 guard, dev loopback guard.

Written as plain ASGI callables (not BaseHTTPMiddleware) so the global exception
guard can return a deterministic 500 response without re-raising — required for
both production behavior and in-process test transports (PLAN §5).
"""

import ipaddress
import json
import logging
import re
import time
import uuid

from app.core.config import Settings
from app.core.logging import request_id_var

logger = logging.getLogger("oneflow.request")

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,128}$")


def is_loopback_host(host: str) -> bool:
    """True for genuine loopback client addresses, including the IPv4-mapped
    form ::ffff:127.0.0.1 that dual-stack binds report (review finding #10).
    Unparseable values are treated as non-loopback (fail-closed)."""
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    if ip.is_loopback:
        return True
    mapped = getattr(ip, "ipv4_mapped", None)
    return mapped is not None and mapped.is_loopback


# Probe paths are exempt from the dev loopback guard: they are unauthenticated,
# return no data, and container/orchestrator probes legitimately arrive non-loopback.
GUARD_EXEMPT_PATHS = {"/api/v1/healthz", "/api/v1/health"}


def _get_header(scope, name: bytes) -> str | None:
    for key, value in scope.get("headers", []):
        if key.lower() == name:
            return value.decode("latin-1")
    return None


async def _send_json(send, status: int, payload: dict, request_id: str | None = None) -> None:
    body = json.dumps(payload).encode()
    headers = [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]
    if request_id:
        headers.append((b"x-request-id", request_id.encode("latin-1")))
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})


class RequestIdMiddleware:
    """Validate/issue X-Request-ID, expose it via contextvar and response header."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = _get_header(scope, b"x-request-id")
        request_id = incoming if incoming and _REQUEST_ID_RE.match(incoming) else uuid.uuid4().hex
        token = request_id_var.set(request_id)
        scope.setdefault("state", {})["request_id"] = request_id

        async def send_with_header(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode("latin-1")))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_header)
        finally:
            request_id_var.reset(token)


class ExceptionGuardMiddleware:
    """Global 500 policy: safe body only, full traceback to server logs (PLAN §5)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def tracking_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, tracking_send)
        except Exception:
            request_id = scope.get("state", {}).get("request_id", "-")
            logger.exception("unhandled exception (request_id=%s)", request_id)
            if not started:
                await _send_json(
                    send, 500, {"detail": "internal server error"}, request_id=request_id
                )
            else:  # response already begun — nothing safe to send
                raise


class RequestLogMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        start = time.perf_counter()
        status_holder = {"status": 0}

        async def send_logged(message):
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_logged)
        except Exception:
            # The outer ExceptionGuard converts this into a 500 — record the
            # access-log line here so 500s are countable (review finding #9).
            status_holder["status"] = status_holder["status"] or 500
            raise
        finally:
            duration_ms = (time.perf_counter() - start) * 1000
            logger.info(
                "%s %s -> %d (%.1fms)",
                scope.get("method"),
                scope.get("path"),
                status_holder["status"],
                duration_ms,
            )


class DevLoopbackGuardMiddleware:
    """v5.1 (Codex R5): in dev auth mode only loopback clients may talk to the API.

    Binding to 127.0.0.1 and CORS are advisory; this is the code-level boundary
    that keeps a misconfigured 0.0.0.0 / proxied dev instance from becoming an
    unauthenticated public API. Escape hatch: ONEFLOW_DEV_ALLOW_NONLOCAL=true
    (valid in development/test only — enforced at startup).
    """

    def __init__(self, app, settings: Settings):
        self.app = app
        self.settings = settings

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        if (
            self.settings.auth_mode == "dev"
            and not self.settings.dev_allow_nonlocal_enabled
            and scope.get("path") not in GUARD_EXEMPT_PATHS
        ):
            client = scope.get("client")
            host = client[0] if client else None
            # host is None for some in-process transports — treat as local.
            if host is not None and not is_loopback_host(host):
                request_id = scope.get("state", {}).get("request_id")
                await _send_json(
                    send, 403, {"detail": "dev auth is loopback-only"}, request_id=request_id
                )
                return
        await self.app(scope, receive, send)
