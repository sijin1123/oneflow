import asyncio
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy import update as sa_update

from app.api.v1 import auth_assistance
from app.core.auth import DEV_USER_EMAIL
from app.models.auth_assistance_request import AuthAssistanceRateLimit, AuthAssistanceRequest
from app.models.user import User
from app.services.auth_assistance import (
    AUTH_ASSISTANCE_RETENTION_DAYS,
    redact_expired_auth_assistance,
)


async def test_public_submission_is_generic_durable_and_deduplicated(client, app):
    first = await client.post(
        "/api/v1/auth/assistance-requests",
        json={"kind": "sign_in_help", "email": " Missing@Example.Test ", "reason": "Help"},
    )
    second = await client.post(
        "/api/v1/auth/assistance-requests",
        json={"kind": "sign_in_help", "email": "missing@example.test", "reason": "Again"},
    )
    existing = await client.post(
        "/api/v1/auth/assistance-requests",
        json={"kind": "sign_in_help", "email": DEV_USER_EMAIL},
    )

    assert first.status_code == second.status_code == existing.status_code == 202
    assert first.json() == second.json() == existing.json()
    assert first.headers["cache-control"] == "no-store"
    async with app.state.sessionmaker() as session:
        rows = (
            (
                await session.execute(
                    select(AuthAssistanceRequest).order_by(AuthAssistanceRequest.email)
                )
            )
            .scalars()
            .all()
        )
    assert [row.email for row in rows] == [DEV_USER_EMAIL, "missing@example.test"]
    assert rows[1].submission_count == 1
    assert rows[1].reason == "Help"


async def test_public_submission_validates_only_request_shape(client):
    invalid_email = await client.post(
        "/api/v1/auth/assistance-requests",
        json={"kind": "workspace_access", "email": "not-an-email"},
    )
    invalid_kind = await client.post(
        "/api/v1/auth/assistance-requests",
        json={"kind": "reset_password", "email": "person@example.test"},
    )
    too_long = await client.post(
        "/api/v1/auth/assistance-requests",
        json={
            "kind": "workspace_access",
            "email": "person@example.test",
            "reason": "x" * 1001,
        },
    )
    assert invalid_email.status_code == invalid_kind.status_code == too_long.status_code == 422


async def test_public_submission_silently_applies_global_cap(client, app, monkeypatch):
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            sa_update(AuthAssistanceRateLimit)
            .where(AuthAssistanceRateLimit.id == 1)
            .values(window_started_at=func.now(), attempt_count=0, updated_at=func.now())
        )
    monkeypatch.setattr(auth_assistance, "AUTH_ASSISTANCE_GLOBAL_LIMIT_PER_HOUR", 1)
    first, limited = await asyncio.gather(
        client.post(
            "/api/v1/auth/assistance-requests",
            json={"kind": "workspace_access", "email": "first@example.test"},
        ),
        client.post(
            "/api/v1/auth/assistance-requests",
            json={"kind": "workspace_access", "email": "second@example.test"},
        ),
    )
    assert first.status_code == limited.status_code == 202
    assert first.json() == limited.json()
    async with app.state.sessionmaker() as session:
        rows = (await session.execute(select(AuthAssistanceRequest))).scalars().all()
    assert len(rows) == 1
    assert rows[0].email in {"first@example.test", "second@example.test"}


async def test_admin_queue_filters_and_triages_with_optimistic_version(client):
    await client.post(
        "/api/v1/auth/assistance-requests",
        json={
            "kind": "workspace_access",
            "email": "new.person@example.test",
            "reason": "Joining the delivery team",
        },
    )
    listed = await client.get(
        "/api/v1/admin/auth-assistance-requests",
        params={"status": "pending", "kind": "workspace_access"},
    )
    assert listed.status_code == 200
    item = listed.json()["items"][0]
    assert item["email"] == "new.person@example.test"
    assert item["version"] == 1

    missing_note = await client.patch(
        f"/api/v1/admin/auth-assistance-requests/{item['id']}",
        json={"status": "resolved", "expected_version": 1},
    )
    assert missing_note.status_code == 422

    review = await client.patch(
        f"/api/v1/admin/auth-assistance-requests/{item['id']}",
        json={"status": "in_review", "expected_version": 1, "note": "Checking sponsor"},
    )
    assert review.status_code == 200
    assert review.json()["status"] == "in_review"
    assert review.json()["version"] == 2

    backward = await client.patch(
        f"/api/v1/admin/auth-assistance-requests/{item['id']}",
        json={"status": "pending", "expected_version": 2},
    )
    assert backward.status_code == 422

    stale = await client.patch(
        f"/api/v1/admin/auth-assistance-requests/{item['id']}",
        json={"status": "resolved", "expected_version": 1, "note": "Provisioned"},
    )
    assert stale.status_code == 409

    resolved = await client.patch(
        f"/api/v1/admin/auth-assistance-requests/{item['id']}",
        json={"status": "resolved", "expected_version": 2, "note": "Provisioned"},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["triaged_by_id"] is not None

    redacted = await client.delete(f"/api/v1/admin/auth-assistance-requests/{item['id']}")
    assert redacted.status_code == 204
    after = await client.get("/api/v1/admin/auth-assistance-requests")
    redacted_item = after.json()["items"][0]
    assert redacted_item["email"] is None
    assert redacted_item["reason"] is None
    assert redacted_item["triage_note"] is None
    assert redacted_item["redacted_at"] is not None


async def test_admin_queue_rejects_non_admin(client, app):
    async with app.state.sessionmaker() as session, session.begin():
        user = (
            await session.execute(select(User).where(User.email == DEV_USER_EMAIL))
        ).scalar_one()
        user.is_admin = False
    response = await client.get("/api/v1/admin/auth-assistance-requests")
    assert response.status_code == 403


async def test_terminal_contact_data_is_redacted_after_retention(client, app):
    await client.post(
        "/api/v1/auth/assistance-requests",
        json={"kind": "sign_in_help", "email": "retention@example.test"},
    )
    item = (await client.get("/api/v1/admin/auth-assistance-requests")).json()["items"][0]
    await client.patch(
        f"/api/v1/admin/auth-assistance-requests/{item['id']}",
        json={"status": "rejected", "expected_version": 1, "note": "Use provider recovery"},
    )
    async with app.state.sessionmaker() as session, session.begin():
        now = (await session.execute(select(func.now()))).scalar_one()
        await session.execute(
            sa_update(AuthAssistanceRequest)
            .where(AuthAssistanceRequest.id == item["id"])
            .values(triaged_at=now - timedelta(days=AUTH_ASSISTANCE_RETENTION_DAYS + 1))
        )
        await redact_expired_auth_assistance(session, now)
    async with app.state.sessionmaker() as session:
        row = (
            await session.execute(
                select(AuthAssistanceRequest).where(AuthAssistanceRequest.id == item["id"])
            )
        ).scalar_one()
    assert row.email is None
    assert row.reason is None
    assert row.triage_note is None
    assert row.redacted_at is not None
