import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models import User, WorkspaceInvitation


async def _create(client, email="new.member@example.com", name="New Member"):
    response = await client.post(
        "/api/v1/workspace-invitations",
        json={"email": email, "display_name": name},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_workspace_invitation_create_preview_accept_and_list(client, app):
    invitation = await _create(client, "  Invitee@Example.com ", "  초대 사용자  ")
    assert invitation["email"] == "invitee@example.com"
    assert invitation["display_name"] == "초대 사용자"
    assert invitation["status"] == "pending"

    async with app.state.sessionmaker() as session:
        stored = (
            await session.execute(
                select(WorkspaceInvitation).where(WorkspaceInvitation.id == invitation["id"])
            )
        ).scalar_one()
        assert stored.token_hash != invitation["token"]
        assert invitation["token"] not in stored.token_hash

    preview = await client.post(
        "/api/v1/workspace-invitations/preview",
        json={"token": invitation["token"]},
    )
    assert preview.status_code == 200, preview.text
    assert preview.headers["cache-control"] == "no-store"
    assert preview.json()["masked_email"] == "i******@example.com"
    assert "email" not in preview.json()

    accepted = await client.post(
        "/api/v1/workspace-invitations/accept",
        json={"token": invitation["token"]},
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.headers["cache-control"] == "no-store"
    assert accepted.json() == {
        "email": "invitee@example.com",
        "display_name": "초대 사용자",
        "login_path": "/login",
    }
    async with app.state.sessionmaker() as session:
        user = (
            await session.execute(select(User).where(User.email == "invitee@example.com"))
        ).scalar_one()
        assert user.is_active is True
        assert user.is_admin is False

    consumed = await client.post(
        "/api/v1/workspace-invitations/accept",
        json={"token": invitation["token"]},
    )
    assert consumed.status_code == 410
    listed = await client.get("/api/v1/workspace-invitations")
    assert listed.status_code == 200
    assert listed.json()["items"][0]["status"] == "accepted"


async def test_workspace_invitation_duplicate_active_and_pending_guards(client):
    pending = await _create(client)
    duplicate = await client.post(
        "/api/v1/workspace-invitations",
        json={"email": pending["email"], "display_name": "Duplicate"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "a pending invitation already exists"

    active = await client.post(
        "/api/v1/users",
        json={"email": "active@example.com", "display_name": "Active"},
    )
    assert active.status_code == 201
    response = await client.post(
        "/api/v1/workspace-invitations",
        json={"email": "active@example.com", "display_name": "Active"},
    )
    assert response.status_code == 409


async def test_workspace_invitation_rotate_invalidates_old_token_and_revoke(client):
    invitation = await _create(client)
    rotated_response = await client.post(
        f"/api/v1/workspace-invitations/{invitation['id']}/rotate",
        json={"expected_version": invitation["version"]},
    )
    assert rotated_response.status_code == 200, rotated_response.text
    rotated = rotated_response.json()
    assert rotated["token"] != invitation["token"]
    assert rotated["version"] == 1
    assert (
        await client.post(
            "/api/v1/workspace-invitations/preview",
            json={"token": invitation["token"]},
        )
    ).status_code == 404

    stale = await client.delete(
        f"/api/v1/workspace-invitations/{invitation['id']}?expected_version=0"
    )
    assert stale.status_code == 409
    revoked = await client.delete(
        f"/api/v1/workspace-invitations/{invitation['id']}?expected_version=1"
    )
    assert revoked.status_code == 204
    assert (
        await client.post(
            "/api/v1/workspace-invitations/accept",
            json={"token": rotated["token"]},
        )
    ).status_code == 410


async def test_workspace_invitation_expiry_and_inactive_reactivation(client, app):
    async with app.state.sessionmaker() as session, session.begin():
        session.add(
            User(
                email="inactive@example.com",
                display_name="Old Name",
                is_active=False,
                is_admin=False,
            )
        )
    invitation = await _create(client, "inactive@example.com", "Restored Name")
    async with app.state.sessionmaker() as session, session.begin():
        row = (
            await session.execute(
                select(WorkspaceInvitation).where(WorkspaceInvitation.id == invitation["id"])
            )
        ).scalar_one()
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    expired = await client.post(
        "/api/v1/workspace-invitations/accept",
        json={"token": invitation["token"]},
    )
    assert expired.status_code == 410

    replacement = await _create(client, "inactive@example.com", "Restored Name")
    accepted = await client.post(
        "/api/v1/workspace-invitations/accept",
        json={"token": replacement["token"]},
    )
    assert accepted.status_code == 200
    async with app.state.sessionmaker() as session:
        user = (
            await session.execute(select(User).where(User.email == "inactive@example.com"))
        ).scalar_one()
        assert user.is_active is True
        assert user.display_name == "Restored Name"


async def test_workspace_invitation_inactive_admin_cannot_be_reactivated(client, app):
    async with app.state.sessionmaker() as session, session.begin():
        session.add(
            User(
                email="inactive.admin@example.com",
                display_name="Inactive Admin",
                is_active=False,
                is_admin=True,
            )
        )
    response = await client.post(
        "/api/v1/workspace-invitations",
        json={"email": "inactive.admin@example.com", "display_name": "Inactive Admin"},
    )
    assert response.status_code == 409


async def test_workspace_invitation_admin_authz(client, app):
    async with app.state.sessionmaker() as session, session.begin():
        dev = (
            await session.execute(select(User).where(User.email == "dev@oneflow.local"))
        ).scalar_one()
        dev.is_admin = False
    assert (await client.get("/api/v1/workspace-invitations")).status_code == 403
    assert (
        await client.post(
            "/api/v1/workspace-invitations",
            json={"email": "blocked@example.com", "display_name": "Blocked"},
        )
    ).status_code == 403


async def test_workspace_invitation_concurrent_accept_is_one_time(client):
    invitation = await _create(client)
    first, second = await asyncio.gather(
        client.post(
            "/api/v1/workspace-invitations/accept",
            json={"token": invitation["token"]},
        ),
        client.post(
            "/api/v1/workspace-invitations/accept",
            json={"token": invitation["token"]},
        ),
    )
    assert sorted([first.status_code, second.status_code]) == [200, 410]


async def test_workspace_invitation_validation_and_openapi(client, app):
    for body in (
        {"email": "not-an-email", "display_name": "Valid"},
        {"email": "valid@example.com", "display_name": " "},
    ):
        assert (await client.post("/api/v1/workspace-invitations", json=body)).status_code == 422
    assert (
        await client.post("/api/v1/workspace-invitations/preview", json={"token": "too-short"})
    ).status_code == 422
    paths = app.openapi()["paths"]
    assert set(paths["/api/v1/workspace-invitations"]["post"]["responses"]) >= {
        "201",
        "403",
        "409",
    }
    assert set(paths["/api/v1/workspace-invitations/accept"]["post"]["responses"]) >= {
        "200",
        "404",
        "409",
        "410",
    }
