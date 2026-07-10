import hashlib
import hmac

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.main import create_app
from tests.conftest import create_project, make_test_settings


@pytest.fixture
async def webhook_app(_clean_tables):
    application = create_app(
        make_test_settings(
            webhook_signing_key="test-signing-key-that-is-at-least-32-bytes",
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

    rotated = await webhook_client.post(f"/api/v1/webhooks/{endpoint['id']}/rotate-secret")
    assert rotated.status_code == 200
    assert rotated.json()["secret"] != first_secret
    assert rotated.json()["item"]["secret_version"] == 2


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
