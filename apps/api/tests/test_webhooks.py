import asyncio
import hashlib
import hmac
import json
import socket
import ssl
import uuid
from datetime import UTC, datetime, timedelta

import pytest
import trustme
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text, update

from app.main import create_app
from app.models.webhook import WebhookDelivery
from app.services.webhooks import (
    ResolvedWebhookTarget,
    claim_due_delivery_ids,
    default_sender,
    dispatch_due_deliveries,
    enqueue_event,
    validate_webhook_url,
)
from tests.conftest import create_project, make_test_settings


@pytest.fixture
async def webhook_app(_clean_tables):
    application = create_app(
        make_test_settings(
            webhook_signing_key="test-signing-key-that-is-at-least-32-bytes",
            webhook_signing_keys={"2026-q3": "next-signing-key-that-is-at-least-32-bytes"},
            webhook_active_signing_key_id="2026-q3",
            webhook_allowed_hosts="example.com",
        )
    )
    application.state.sent_webhooks = []

    async def sender(url: str, body: bytes, headers: dict[str, str]) -> int:
        application.state.sent_webhooks.append((url, body, headers))
        return 204

    application.state.webhook_sender = sender
    yield application
    await application.state.engine.dispose()


@pytest.fixture
async def webhook_client(webhook_app):
    transport = ASGITransport(app=webhook_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def create_endpoint(client: AsyncClient) -> dict:
    response = await client.post(
        "/api/v1/webhooks",
        json={
            "name": "Work sync",
            "url": "https://example.com/oneflow",
            "event_types": ["work_package.created", "work_package.updated"],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_webhook_capability_is_fail_closed(client):
    listed = await client.get("/api/v1/webhooks")
    assert listed.status_code == 200
    assert listed.json()["enabled"] is False
    created = await client.post(
        "/api/v1/webhooks",
        json={"name": "x", "url": "https://example.com", "event_types": ["work_package.created"]},
    )
    assert created.status_code == 503


async def test_create_list_rotate_and_signed_test_delivery(webhook_app, webhook_client):
    created = await create_endpoint(webhook_client)
    endpoint = created["item"]
    first_secret = created["secret"]
    assert first_secret.startswith("ofw_")

    listed = (await webhook_client.get("/api/v1/webhooks")).json()
    assert listed["enabled"] is True
    assert listed["total"] == 1
    assert listed["active_signing_key_id"] == "2026-q3"
    assert listed["available_signing_key_ids"] == ["2026-q3", "legacy-v1"]
    assert listed["rotations"] == []
    assert "secret" not in listed["items"][0]

    delivery = await webhook_client.post(f"/api/v1/webhooks/{endpoint['id']}/test")
    assert delivery.status_code == 200, delivery.text
    assert delivery.json()["status"] == "succeeded"
    _, body, headers = webhook_app.state.sent_webhooks[-1]
    signed = hmac.new(
        first_secret.encode(),
        f"{headers['x-oneflow-timestamp']}.".encode() + body,
        hashlib.sha256,
    ).hexdigest()
    assert headers["x-oneflow-signature"] == f"sha256={signed}"
    assert headers["x-oneflow-key-id"] == "2026-q3"
    assert headers["x-oneflow-secret-version"] == "1"

    rotated = await webhook_client.post(
        f"/api/v1/webhooks/{endpoint['id']}/rotate-secret",
        json={
            "target_signing_key_id": "legacy-v1",
            "expected_secret_version": 1,
            "reason": "scheduled rotation",
        },
    )
    assert rotated.status_code == 200
    assert rotated.json()["secret"] != first_secret
    assert rotated.json()["item"]["secret_version"] == 2
    assert rotated.json()["item"]["signing_key_id"] == "legacy-v1"

    rotations = (await webhook_client.get("/api/v1/webhooks")).json()["rotations"]
    assert rotations[0]["previous_signing_key_id"] == "2026-q3"
    assert rotations[0]["signing_key_id"] == "legacy-v1"
    assert rotations[0]["reason"] == "scheduled rotation"
    stale = await webhook_client.post(
        f"/api/v1/webhooks/{endpoint['id']}/rotate-secret",
        json={
            "target_signing_key_id": "2026-q3",
            "expected_secret_version": 1,
            "reason": "stale request",
        },
    )
    assert stale.status_code == 409
    unknown = await webhook_client.post(
        f"/api/v1/webhooks/{endpoint['id']}/rotate-secret",
        json={
            "target_signing_key_id": "unknown",
            "expected_secret_version": 2,
            "reason": "invalid target",
        },
    )
    assert unknown.status_code == 422


async def test_admin_guard_and_url_policy(webhook_app, webhook_client):
    async with webhook_app.state.sessionmaker() as session, session.begin():
        await session.execute(text("UPDATE users SET is_admin = false"))
    assert (await webhook_client.get("/api/v1/webhooks")).status_code == 403

    async with webhook_app.state.sessionmaker() as session, session.begin():
        await session.execute(text("UPDATE users SET is_admin = true"))
    blocked = await webhook_client.post(
        "/api/v1/webhooks",
        json={
            "name": "private",
            "url": "https://127.0.0.1/hook",
            "event_types": ["work_package.created"],
        },
    )
    assert blocked.status_code == 422

    blocked_port = await webhook_client.post(
        "/api/v1/webhooks",
        json={
            "name": "unexpected port",
            "url": "https://example.com:8443/hook",
            "event_types": ["work_package.created"],
        },
    )
    assert blocked_port.status_code == 422


async def test_webhook_dns_result_is_a_single_pinned_transport_contract(monkeypatch):
    settings = make_test_settings(
        webhook_signing_key="x" * 32,
        webhook_allowed_hosts="hooks.example.com",
    )

    def resolved(*_args, **_kwargs):
        return [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443)),
            (socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("2001:4860:4860::8888", 443, 0, 0)),
        ]

    monkeypatch.setattr("app.services.webhooks.socket.getaddrinfo", resolved)
    target = await validate_webhook_url("https://hooks.example.com:443/oneflow", settings)
    assert target.authority == "hooks.example.com:443"
    assert target.hostname == "hooks.example.com"
    assert target.candidates == ("2001:4860:4860::8888", "8.8.8.8")


async def test_webhook_rejects_mixed_public_and_private_dns_answers(monkeypatch):
    settings = make_test_settings(
        webhook_signing_key="x" * 32,
        webhook_allowed_hosts="hooks.example.com",
    )
    monkeypatch.setattr(
        "app.services.webhooks.socket.getaddrinfo",
        lambda *_args, **_kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.1", 443)),
        ],
    )
    with pytest.raises(ValueError, match="non-public"):
        await validate_webhook_url("https://hooks.example.com/oneflow", settings)


@pytest.mark.parametrize(
    "address",
    [
        "64:ff9b::a00:1",
        "::ffff:8.8.8.8",
        "2002:0808:0808::1",
        "2001:0000:4136:e378:8000:63bf:3fff:fdd2",
    ],
)
async def test_webhook_rejects_nat64_and_ipv4_transition_answers(monkeypatch, address):
    settings = make_test_settings(
        webhook_signing_key="x" * 32,
        webhook_allowed_hosts="hooks.example.com",
    )
    monkeypatch.setattr(
        "app.services.webhooks.socket.getaddrinfo",
        lambda *_args, **_kwargs: [
            (socket.AF_INET6, socket.SOCK_STREAM, 6, "", (address, 443, 0, 0))
        ],
    )
    with pytest.raises(ValueError, match="non-public"):
        await validate_webhook_url("https://hooks.example.com/oneflow", settings)


async def test_default_sender_pins_literal_but_keeps_host_sni_and_no_proxy(monkeypatch):
    observed: dict[str, object] = {}

    class Response:
        status_code = 204

        async def aclose(self):
            return None

    class Client:
        def __init__(self, **kwargs):
            observed["client"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def build_request(self, method, url, **kwargs):
            import httpx

            return httpx.Request(method, url, **kwargs)

        async def send(self, request, *, stream):
            observed["request"] = request
            observed["stream"] = stream
            return Response()

    monkeypatch.setattr("app.services.webhooks.httpx.AsyncClient", Client)
    target = ResolvedWebhookTarget(
        "https://hooks.example.com:443/oneflow",
        "hooks.example.com",
        "hooks.example.com:443",
        443,
        ("8.8.8.8",),
    )
    assert await default_sender(target, b"{}", {"x-test": "1"}) == 204
    request = observed["request"]
    assert str(request.url).startswith("https://8.8.8.8")
    assert request.headers["host"] == "hooks.example.com:443"
    assert request.extensions["sni_hostname"] == "hooks.example.com"
    client_options = observed["client"]
    assert client_options["follow_redirects"] is False
    assert client_options["trust_env"] is False
    assert client_options["http2"] is False


async def test_default_sender_real_tls_uses_literal_dial_with_original_sni_and_host(monkeypatch):
    ca = trustme.CA()
    cert = ca.issue_cert("hooks.example.com")
    server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    cert.configure_cert(server_context)
    observed_sni: list[str | None] = []
    observed_request: list[str] = []
    server_context.set_servername_callback(
        lambda _socket, server_name, _context: observed_sni.append(server_name)
    )

    async def handle(reader, writer):
        request = await reader.readuntil(b"\r\n\r\n")
        observed_request.append(request.decode("ascii"))
        writer.write(b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        await writer.drain()
        writer.close()
        await writer.wait_closed()

    server = await asyncio.start_server(handle, "127.0.0.1", 0, ssl=server_context)
    port = server.sockets[0].getsockname()[1]
    client_context = ssl.create_default_context()
    ca.configure_trust(client_context)
    monkeypatch.setattr(
        "httpx._transports.default.create_ssl_context", lambda **_kwargs: client_context
    )
    target = ResolvedWebhookTarget(
        f"https://hooks.example.com:{port}/oneflow",
        "hooks.example.com",
        f"hooks.example.com:{port}",
        port,
        ("127.0.0.1",),
    )
    try:
        assert await default_sender(target, b"{}", {"x-test": "1"}) == 204
    finally:
        server.close()
        await server.wait_closed()
    assert observed_sni == ["hooks.example.com"]
    assert f"host: hooks.example.com:{port}\r\n" in observed_request[0].lower()


async def test_default_sender_enforces_one_total_deadline_without_failover(monkeypatch):
    attempts = 0

    class Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def build_request(self, method, url, **kwargs):
            import httpx

            return httpx.Request(method, url, **kwargs)

        async def send(self, _request, *, stream):
            nonlocal attempts
            attempts += 1
            await asyncio.sleep(1)

    monkeypatch.setattr("app.services.webhooks.httpx.AsyncClient", Client)
    monkeypatch.setattr("app.services.webhooks.WEBHOOK_DELIVERY_DEADLINE_SECONDS", 0.02)
    target = ResolvedWebhookTarget(
        "https://hooks.example.com/x",
        "hooks.example.com",
        "hooks.example.com",
        443,
        ("8.8.8.8", "1.1.1.1"),
    )
    with pytest.raises(TimeoutError):
        await default_sender(target, b"{}", {})
    assert attempts == 1


async def test_default_sender_does_not_fail_over_after_a_read_error(monkeypatch):
    attempts = 0

    class Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def build_request(self, method, url, **kwargs):
            import httpx

            return httpx.Request(method, url, **kwargs)

        async def send(self, _request, *, stream):
            nonlocal attempts
            attempts += 1
            import httpx

            raise httpx.ReadError("ambiguous write/read outcome")

    monkeypatch.setattr("app.services.webhooks.httpx.AsyncClient", Client)
    target = ResolvedWebhookTarget(
        "https://hooks.example.com/x",
        "hooks.example.com",
        "hooks.example.com",
        443,
        ("8.8.8.8", "1.1.1.1"),
    )
    with pytest.raises(Exception, match="ambiguous"):
        await default_sender(target, b"{}", {})
    assert attempts == 1


async def test_default_sender_fails_over_only_for_connect_errors(monkeypatch):
    attempts: list[str] = []

    class Response:
        status_code = 202

        async def aclose(self):
            return None

    class Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def build_request(self, method, url, **kwargs):
            import httpx

            return httpx.Request(method, url, **kwargs)

        async def send(self, request, *, stream):
            import httpx

            attempts.append(request.url.host)
            if len(attempts) == 1:
                raise httpx.ConnectError("first address unavailable", request=request)
            return Response()

    monkeypatch.setattr("app.services.webhooks.httpx.AsyncClient", Client)
    target = ResolvedWebhookTarget(
        "https://hooks.example.com/x",
        "hooks.example.com",
        "hooks.example.com",
        443,
        ("8.8.8.8", "1.1.1.1"),
    )
    assert await default_sender(target, b"{}", {}) == 202
    assert attempts == ["8.8.8.8", "1.1.1.1"]


async def test_delivery_snapshot_survives_rotation_and_missing_key_is_recoverable(
    webhook_app, webhook_client, monkeypatch
):
    endpoint = (await create_endpoint(webhook_client))["item"]
    event_id = uuid.uuid4()
    async with webhook_app.state.sessionmaker() as session, session.begin():
        await enqueue_event(
            session,
            "work_package.created",
            event_id,
            {"id": str(event_id), "event": "work_package.created", "data": {}},
        )

    rotated = await webhook_client.post(
        f"/api/v1/webhooks/{endpoint['id']}/rotate-secret",
        json={
            "target_signing_key_id": "legacy-v1",
            "expected_secret_version": 1,
            "reason": "switch endpoint key",
        },
    )
    assert rotated.status_code == 200

    calls: list[dict[str, str]] = []

    async def sender(_target, _body, headers):
        calls.append(headers)
        return 204

    missing_settings = webhook_app.state.settings.model_copy(
        update={"webhook_signing_keys": None, "webhook_active_signing_key_id": None}
    )
    with monkeypatch.context() as context:
        context.setattr(
            "app.services.webhooks.socket.getaddrinfo",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("DNS must not run")),
        )
        assert (
            await dispatch_due_deliveries(
                webhook_app.state.sessionmaker,
                missing_settings,
                sender,
                event_id=event_id,
            )
            == 1
        )
    assert calls == []
    async with webhook_app.state.sessionmaker() as session, session.begin():
        delivery = (
            await session.execute(
                select(WebhookDelivery).where(WebhookDelivery.event_id == event_id)
            )
        ).scalar_one()
        assert delivery.signing_key_id == "2026-q3"
        assert delivery.secret_version == 1
        assert delivery.status == "failed"
        assert delivery.error == "signing_key_unavailable:2026-q3"
        delivery.status = "pending"
        delivery.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
        delivery.completed_at = None

    assert (
        await dispatch_due_deliveries(
            webhook_app.state.sessionmaker,
            webhook_app.state.settings,
            sender,
            event_id=event_id,
        )
        == 1
    )
    assert calls[0]["x-oneflow-key-id"] == "2026-q3"
    assert calls[0]["x-oneflow-secret-version"] == "1"


async def test_migration_trigger_snapshots_inserts_from_pre_0064_writers(webhook_app):
    endpoint_id = uuid.uuid4()
    delivery_id = uuid.uuid4()
    event_id = uuid.uuid4()
    async with webhook_app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text("""
                INSERT INTO webhook_endpoints
                    (id, name, url, event_types, is_active, secret_version)
                VALUES
                    (:id, 'rolling writer', 'https://example.com/hook',
                     '["work_package.created"]'::jsonb, true, 7)
            """),
            {"id": endpoint_id},
        )
        await session.execute(
            text("""
                INSERT INTO webhook_deliveries
                    (id, endpoint_id, event_id, event_type, payload, status, attempt_count)
                VALUES
                    (:id, :endpoint_id, :event_id, 'work_package.created',
                     '{}'::jsonb, 'pending', 0)
            """),
            {"id": delivery_id, "endpoint_id": endpoint_id, "event_id": event_id},
        )
        snapshot = (
            await session.execute(
                text("""
                    SELECT signing_key_id, secret_version, signing_snapshot_source
                      FROM webhook_deliveries WHERE id = :id
                """),
                {"id": delivery_id},
            )
        ).one()
        assert snapshot == ("legacy-v1", 7, "captured")


@pytest.mark.parametrize("field", ["name", "url", "event_types", "is_active"])
async def test_update_rejects_explicit_null(field, webhook_client):
    endpoint = (await create_endpoint(webhook_client))["item"]
    response = await webhook_client.patch(f"/api/v1/webhooks/{endpoint['id']}", json={field: None})
    assert response.status_code == 422


async def test_work_package_events_are_delivered_and_audited(webhook_app, webhook_client):
    endpoint = (await create_endpoint(webhook_client))["item"]
    project = await create_project(webhook_client, key="WHK", name="Webhook project")
    created = await webhook_client.post(
        f"/api/v1/projects/{project['id']}/work-packages",
        json={"subject": "Send me", "status": "todo"},
    )
    assert created.status_code == 201, created.text
    assert any(
        headers["x-oneflow-event"] == "work_package.created"
        for _, _, headers in webhook_app.state.sent_webhooks
    )

    deliveries = (
        await webhook_client.get(f"/api/v1/webhook-deliveries?endpoint_id={endpoint['id']}")
    ).json()
    assert deliveries["total"] >= 1
    assert deliveries["items"][0]["status"] == "succeeded"
    delivered_payload = json.loads(webhook_app.state.sent_webhooks[-1][1])
    assert deliveries["items"][0]["event_id"] == delivered_payload["id"]

    patched = await webhook_client.patch(
        f"/api/v1/work-packages/{created.json()['id']}",
        json={"expected_version": 0, "priority": "high"},
    )
    assert patched.status_code == 200, patched.text
    assert any(
        headers["x-oneflow-event"] == "work_package.updated"
        for _, _, headers in webhook_app.state.sent_webhooks
    )


async def test_delete_preserves_delivery_audit(webhook_client):
    endpoint = (await create_endpoint(webhook_client))["item"]
    assert (await webhook_client.post(f"/api/v1/webhooks/{endpoint['id']}/test")).status_code == 200
    assert (await webhook_client.delete(f"/api/v1/webhooks/{endpoint['id']}")).status_code == 204
    assert (await webhook_client.get("/api/v1/webhooks")).json()["total"] == 0
    assert (await webhook_client.get("/api/v1/webhook-deliveries")).json()["total"] == 1


async def test_enqueue_event_rolls_back_with_domain_transaction(webhook_app, webhook_client):
    await create_endpoint(webhook_client)
    event_id = uuid.uuid4()
    with pytest.raises(RuntimeError, match="rollback"):
        async with webhook_app.state.sessionmaker() as session, session.begin():
            await enqueue_event(
                session,
                "work_package.created",
                event_id,
                {"id": str(event_id), "event": "work_package.created", "data": {}},
            )
            raise RuntimeError("rollback")

    async with webhook_app.state.sessionmaker() as session:
        rows = (
            await session.execute(
                select(WebhookDelivery).where(WebhookDelivery.event_id == event_id)
            )
        ).scalars()
        assert list(rows) == []


async def test_concurrent_claim_has_single_winner(webhook_app, webhook_client):
    await create_endpoint(webhook_client)
    event_id = uuid.uuid4()
    async with webhook_app.state.sessionmaker() as session, session.begin():
        await enqueue_event(
            session,
            "work_package.created",
            event_id,
            {"id": str(event_id), "event": "work_package.created", "data": {}},
        )

    async def claim(owner: str) -> list[uuid.UUID]:
        async with webhook_app.state.sessionmaker() as session:
            return await claim_due_delivery_ids(
                session, webhook_app.state.settings, owner, event_id=event_id
            )

    first, second = await asyncio.gather(claim("worker:first"), claim("worker:second"))
    assert len(first) + len(second) == 1
    async with webhook_app.state.sessionmaker() as session:
        delivery = (
            await session.execute(
                select(WebhookDelivery).where(WebhookDelivery.event_id == event_id)
            )
        ).scalar_one()
        assert delivery.status == "sending"
        assert delivery.attempt_count == 1
        assert delivery.lease_owner in {"worker:first", "worker:second"}


async def test_expired_lease_is_recovered(webhook_app, webhook_client):
    await create_endpoint(webhook_client)
    event_id = uuid.uuid4()
    async with webhook_app.state.sessionmaker() as session, session.begin():
        await enqueue_event(
            session,
            "work_package.created",
            event_id,
            {"id": str(event_id), "event": "work_package.created", "data": {}},
        )
    async with webhook_app.state.sessionmaker() as session, session.begin():
        delivery = (
            await session.execute(
                select(WebhookDelivery).where(WebhookDelivery.event_id == event_id)
            )
        ).scalar_one()
        delivery.status = "sending"
        delivery.attempt_count = 1
        delivery.lease_owner = "worker:crashed"
        delivery.lease_token = uuid.uuid4()
        delivery.leased_until = datetime.now(UTC) - timedelta(seconds=1)

    async with webhook_app.state.sessionmaker() as session:
        claimed = await claim_due_delivery_ids(
            session, webhook_app.state.settings, "worker:recovery", event_id=event_id
        )
    assert len(claimed) == 1
    async with webhook_app.state.sessionmaker() as session:
        delivery = await session.get(WebhookDelivery, claimed[0])
        assert delivery is not None
        assert delivery.attempt_count == 2
        assert delivery.lease_owner == "worker:recovery"


async def test_delayed_worker_cannot_finalize_after_reclaim(webhook_app, webhook_client):
    """A's delayed transport completion loses to B's newer fencing token."""
    await create_endpoint(webhook_client)
    event_id = uuid.uuid4()
    async with webhook_app.state.sessionmaker() as session, session.begin():
        await enqueue_event(
            session,
            "work_package.created",
            event_id,
            {"id": str(event_id), "event": "work_package.created", "data": {}},
        )

    entered, release = asyncio.Event(), asyncio.Event()

    async def delayed_sender(url: str, body: bytes, headers: dict[str, str]) -> int:
        entered.set()
        await release.wait()
        return 500

    delayed = asyncio.create_task(
        dispatch_due_deliveries(
            webhook_app.state.sessionmaker,
            webhook_app.state.settings,
            delayed_sender,
            event_id=event_id,
        )
    )
    await asyncio.wait_for(entered.wait(), timeout=2)
    async with webhook_app.state.sessionmaker() as session, session.begin():
        await session.execute(
            update(WebhookDelivery)
            .where(WebhookDelivery.event_id == event_id)
            .values(leased_until=text("now() - interval '1 second'"))
        )

    async def successful_sender(url: str, body: bytes, headers: dict[str, str]) -> int:
        return 204

    assert (
        await dispatch_due_deliveries(
            webhook_app.state.sessionmaker,
            webhook_app.state.settings,
            successful_sender,
            event_id=event_id,
        )
        == 1
    )
    release.set()
    await delayed
    async with webhook_app.state.sessionmaker() as session:
        delivery = (
            await session.execute(
                select(WebhookDelivery).where(WebhookDelivery.event_id == event_id)
            )
        ).scalar_one()
        assert delivery.status == "succeeded"
        assert delivery.response_status == 204
        assert delivery.attempt_count == 2


async def test_automatic_retry_reaches_dead_letter(webhook_app, webhook_client):
    await create_endpoint(webhook_client)
    event_id = uuid.uuid4()
    async with webhook_app.state.sessionmaker() as session, session.begin():
        await enqueue_event(
            session,
            "work_package.updated",
            event_id,
            {"id": str(event_id), "event": "work_package.updated", "data": {}},
        )

    async def failing_sender(url: str, body: bytes, headers: dict[str, str]) -> int:
        return 503

    settings = webhook_app.state.settings.model_copy(update={"webhook_max_attempts": 2})
    assert (
        await dispatch_due_deliveries(
            webhook_app.state.sessionmaker, settings, failing_sender, event_id=event_id
        )
        == 1
    )
    async with webhook_app.state.sessionmaker() as session, session.begin():
        delivery = (
            await session.execute(
                select(WebhookDelivery).where(WebhookDelivery.event_id == event_id)
            )
        ).scalar_one()
        assert delivery.status == "retrying"
        assert delivery.attempt_count == 1
        delivery.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)

    assert (
        await dispatch_due_deliveries(
            webhook_app.state.sessionmaker, settings, failing_sender, event_id=event_id
        )
        == 1
    )
    async with webhook_app.state.sessionmaker() as session:
        delivery = (
            await session.execute(
                select(WebhookDelivery).where(WebhookDelivery.event_id == event_id)
            )
        ).scalar_one()
        assert delivery.status == "dead_letter"
        assert delivery.attempt_count == 2


async def test_slow_failed_attempt_schedules_from_live_completion_clock(
    webhook_app, webhook_client
):
    """A first backoff must start after a slow sender completes, not at tx start."""
    await create_endpoint(webhook_client)
    event_id = uuid.uuid4()
    async with webhook_app.state.sessionmaker() as session, session.begin():
        await enqueue_event(
            session,
            "work_package.updated",
            event_id,
            {"id": str(event_id), "event": "work_package.updated", "data": {}},
        )

    async def slow_failure(url: str, body: bytes, headers: dict[str, str]) -> int:
        await asyncio.sleep(1.1)
        return 503

    settings = webhook_app.state.settings.model_copy(update={"webhook_max_attempts": 2})
    assert (
        await dispatch_due_deliveries(
            webhook_app.state.sessionmaker, settings, slow_failure, event_id=event_id
        )
        == 1
    )
    async with webhook_app.state.sessionmaker() as session:
        delivery = (
            await session.execute(
                select(WebhookDelivery).where(WebhookDelivery.event_id == event_id)
            )
        ).scalar_one()
        now = (await session.execute(select(func.clock_timestamp()))).scalar_one()
        assert delivery.status == "retrying"
        assert delivery.attempt_count == 1
        assert delivery.next_attempt_at is not None
        assert delivery.next_attempt_at > now


async def test_work_package_write_fanins_enqueue_outbox_rows(webhook_app, webhook_client):
    """Bulk, duplicate, and intake acceptance all enqueue in their write transaction."""
    await create_endpoint(webhook_client)
    project = await create_project(webhook_client, key="OBX", name="Outbox fan-ins")
    project_id = project["id"]
    first = await webhook_client.post(
        f"/api/v1/projects/{project_id}/work-packages", json={"subject": "Bulk source"}
    )
    second = await webhook_client.post(
        f"/api/v1/projects/{project_id}/work-packages",
        json={"subject": "Already done", "status": "done"},
    )
    assert first.status_code == second.status_code == 201

    async def rows(event_type: str) -> list[WebhookDelivery]:
        async with webhook_app.state.sessionmaker() as session:
            return list(
                (
                    await session.execute(
                        select(WebhookDelivery)
                        .where(WebhookDelivery.event_type == event_type)
                        .order_by(WebhookDelivery.created_at, WebhookDelivery.id)
                    )
                ).scalars()
            )

    updated_before = len(await rows("work_package.updated"))
    bulk = await webhook_client.post(
        f"/api/v1/projects/{project_id}/work-packages/bulk-update",
        json={"ids": [first.json()["id"], second.json()["id"]], "patch": {"status": "done"}},
    )
    assert bulk.status_code == 200, bulk.text
    assert bulk.json()["updated_ids"] == [first.json()["id"]]
    assert bulk.json()["unchanged_ids"] == [second.json()["id"]]
    updated = await rows("work_package.updated")
    assert len(updated) == updated_before + 1
    bulk_delivery = next(
        delivery for delivery in updated if delivery.payload["data"]["id"] == first.json()["id"]
    )
    assert bulk_delivery.payload["data"]["changed_fields"] == ["status"]
    assert bulk_delivery.payload["data"]["version"] == 1
    assert datetime.fromisoformat(bulk_delivery.payload["occurred_at"]) > datetime.fromisoformat(
        first.json()["updated_at"]
    )

    created_before = len(await rows("work_package.created"))
    duplicate = await webhook_client.post(f"/api/v1/work-packages/{first.json()['id']}/duplicate")
    assert duplicate.status_code == 201, duplicate.text
    created = await rows("work_package.created")
    assert len(created) == created_before + 1
    assert any(
        delivery.payload["data"]["id"] == duplicate.json()["work_package"]["id"]
        for delivery in created
    )

    intake = await webhook_client.post(
        f"/api/v1/projects/{project_id}/intake", json={"title": "Accepted via intake"}
    )
    assert intake.status_code == 201
    intake_before = len(await rows("work_package.created"))
    accepted = await webhook_client.post(
        f"/api/v1/projects/{project_id}/intake/{intake.json()['id']}/triage",
        json={"status": "accepted"},
    )
    assert accepted.status_code == 200, accepted.text
    created = await rows("work_package.created")
    assert len(created) == intake_before + 1
    assert any(delivery.payload["data"]["subject"] == "Accepted via intake" for delivery in created)
    # The conditional update now fails and rolls the speculative WP/outbox row back.
    conflict = await webhook_client.post(
        f"/api/v1/projects/{project_id}/intake/{intake.json()['id']}/triage",
        json={"status": "accepted"},
    )
    assert conflict.status_code == 409
    assert len(await rows("work_package.created")) == intake_before + 1

    target = await create_project(webhook_client, key="OBT", name="Outbox target")
    child = await webhook_client.post(
        f"/api/v1/projects/{project_id}/work-packages", json={"subject": "Move child"}
    )
    assert child.status_code == 201
    attached = await webhook_client.patch(
        f"/api/v1/work-packages/{child.json()['id']}",
        json={"expected_version": 0, "parent_id": first.json()["id"]},
    )
    assert attached.status_code == 200, attached.text
    move_before = len(await rows("work_package.updated"))
    moved = await webhook_client.post(
        f"/api/v1/work-packages/{first.json()['id']}/move",
        json={
            "target_project_id": target["id"],
            "expected_version": 1,
            "dry_run": False,
        },
    )
    assert moved.status_code == 200, moved.text
    move_rows = (await rows("work_package.updated"))[move_before:]
    assert len(move_rows) == 2
    moved_delivery = next(
        delivery for delivery in move_rows if delivery.payload["data"]["id"] == first.json()["id"]
    )
    child_delivery = next(
        delivery for delivery in move_rows if delivery.payload["data"]["id"] == child.json()["id"]
    )
    assert moved_delivery.payload["data"]["project_id"] == target["id"]
    assert moved_delivery.payload["data"]["version"] == 2
    assert moved_delivery.payload["data"]["changed_fields"] == ["project_id"]
    assert child_delivery.payload["data"]["version"] == 2
    assert child_delivery.payload["data"]["changed_fields"] == ["parent_id"]


async def test_dispatch_claims_and_completes_each_endpoint(webhook_app, webhook_client):
    await create_endpoint(webhook_client)
    await create_endpoint(webhook_client)
    event_id = uuid.uuid4()
    async with webhook_app.state.sessionmaker() as session, session.begin():
        assert (
            await enqueue_event(
                session,
                "work_package.created",
                event_id,
                {"id": str(event_id), "event": "work_package.created", "data": {}},
            )
            == 2
        )

    async def sender(url: str, body: bytes, headers: dict[str, str]) -> int:
        return 204

    assert (
        await dispatch_due_deliveries(
            webhook_app.state.sessionmaker,
            webhook_app.state.settings,
            sender,
            event_id=event_id,
        )
        == 2
    )
    async with webhook_app.state.sessionmaker() as session:
        deliveries = (
            (
                await session.execute(
                    select(WebhookDelivery).where(WebhookDelivery.event_id == event_id)
                )
            )
            .scalars()
            .all()
        )
        assert len(deliveries) == 2
        assert all(delivery.status == "succeeded" for delivery in deliveries)
        assert all(delivery.attempt_count == 1 for delivery in deliveries)
        assert all(delivery.lease_owner is None for delivery in deliveries)


async def test_manual_retry_reuses_delivery_identity(webhook_app, webhook_client):
    endpoint = (await create_endpoint(webhook_client))["item"]
    statuses = iter([500, 204])

    async def sender(url: str, body: bytes, headers: dict[str, str]) -> int:
        return next(statuses)

    webhook_app.state.webhook_sender = sender
    failed = await webhook_client.post(f"/api/v1/webhooks/{endpoint['id']}/test")
    assert failed.status_code == 200
    assert failed.json()["status"] == "failed"
    retried = await webhook_client.post(f"/api/v1/webhook-deliveries/{failed.json()['id']}/retry")
    assert retried.status_code == 200, retried.text
    assert retried.json()["id"] == failed.json()["id"]
    assert retried.json()["event_id"] == failed.json()["event_id"]
    assert retried.json()["attempt_count"] == 2
    assert retried.json()["status"] == "succeeded"
    assert (await webhook_client.get("/api/v1/webhook-deliveries")).json()["total"] == 1


async def test_worker_does_not_claim_manual_test_delivery(webhook_app, webhook_client):
    endpoint = (await create_endpoint(webhook_client))["item"]
    event_id = uuid.uuid4()
    async with webhook_app.state.sessionmaker() as session, session.begin():
        session.add(
            WebhookDelivery(
                endpoint_id=uuid.UUID(endpoint["id"]),
                event_id=event_id,
                event_type="oneflow.test",
                payload={"id": str(event_id), "event": "oneflow.test", "data": {}},
                status="pending",
                next_attempt_at=datetime.now(UTC),
            )
        )
    assert (
        await dispatch_due_deliveries(
            webhook_app.state.sessionmaker, webhook_app.state.settings, event_id=event_id
        )
        == 0
    )


async def test_expired_manual_test_is_failed_without_auto_send(webhook_app, webhook_client):
    endpoint = (await create_endpoint(webhook_client))["item"]
    event_id = uuid.uuid4()
    async with webhook_app.state.sessionmaker() as session, session.begin():
        session.add(
            WebhookDelivery(
                endpoint_id=uuid.UUID(endpoint["id"]),
                event_id=event_id,
                event_type="oneflow.test",
                payload={"id": str(event_id), "event": "oneflow.test", "data": {}},
                status="sending",
                attempt_count=1,
                lease_owner="manual:crashed",
                lease_token=uuid.uuid4(),
                leased_until=datetime.now(UTC) - timedelta(seconds=1),
            )
        )
    assert (
        await dispatch_due_deliveries(
            webhook_app.state.sessionmaker, webhook_app.state.settings, event_id=event_id
        )
        == 0
    )
    assert webhook_app.state.sent_webhooks == []
    recovered = (await webhook_client.get("/api/v1/webhook-deliveries")).json()["items"][0]
    assert recovered["status"] == "failed"
    assert "retry manually" in recovered["error"]
    retried = await webhook_client.post(f"/api/v1/webhook-deliveries/{recovered['id']}/retry")
    assert retried.status_code == 200, retried.text
    assert retried.json()["status"] == "succeeded"


async def test_saturation_creates_operator_retryable_dead_letter(webhook_app, webhook_client):
    endpoint = (await create_endpoint(webhook_client))["item"]
    endpoint_id = uuid.UUID(endpoint["id"])
    async with webhook_app.state.sessionmaker() as session, session.begin():
        for _ in range(100):
            event_id = uuid.uuid4()
            session.add(
                WebhookDelivery(
                    endpoint_id=endpoint_id,
                    event_id=event_id,
                    event_type="work_package.created",
                    payload={"id": str(event_id), "event": "work_package.created", "data": {}},
                    status="pending",
                )
            )
        overflow_event_id = uuid.uuid4()
        await enqueue_event(
            session,
            "work_package.created",
            overflow_event_id,
            {"id": str(overflow_event_id), "event": "work_package.created", "data": {}},
        )
    async with webhook_app.state.sessionmaker() as session:
        overflow = (
            await session.execute(
                select(WebhookDelivery).where(WebhookDelivery.event_id == overflow_event_id)
            )
        ).scalar_one()
        assert overflow.status == "dead_letter"
        assert overflow.error == "backpressure: pending delivery limit reached"
        assert overflow.completed_at is not None


async def test_manual_delivery_rate_limit_is_atomic_under_concurrency(webhook_app, webhook_client):
    endpoint = (await create_endpoint(webhook_client))["item"]
    responses = await asyncio.gather(
        *[webhook_client.post(f"/api/v1/webhooks/{endpoint['id']}/test") for _ in range(6)]
    )
    assert sorted(response.status_code for response in responses) == [200, 200, 200, 200, 200, 429]
    assert len(webhook_app.state.sent_webhooks) == 5
