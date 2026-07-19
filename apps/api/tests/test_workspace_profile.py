"""Workspace General Settings profile API contracts."""

import asyncio
import base64
import uuid
from pathlib import Path

from sqlalchemy import text

from app.models.workspace_profile import WorkspaceProfile
from app.services.storage_sweep import _fetch_keys_from_connection

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPkndLBwMDAxAAGAA2bAS37E8jFAAAAAElFTkSuQmCC"
)


async def update_profile(client, name: str, revision: int = 1):
    return await client.patch(
        "/api/v1/admin/workspace/profile",
        json={"name": name},
        headers={"If-Match": f'"{revision}"'},
    )


async def test_workspace_profile_default_read_and_name_update(client):
    default = await client.get("/api/v1/workspace/profile")
    assert default.status_code == 200
    assert default.headers["etag"] == '"1"'
    assert default.json() == {
        "name": "OneFlow",
        "revision": 1,
        "logo_url": None,
        "logo_content_type": None,
        "logo_filename": None,
        "logo_width": None,
        "logo_height": None,
        "logo_byte_size": None,
    }

    admin = await client.get("/api/v1/admin/workspace/profile")
    assert admin.status_code == 200
    assert admin.headers["etag"] == '"1"'
    assert admin.json()["id"] == 1
    assert admin.json()["updated_by_user_id"] is None
    assert admin.json()["updated_by_name"] is None

    updated = await update_profile(client, "  Product Operations  ")
    assert updated.status_code == 200, updated.text
    assert updated.headers["etag"] == '"2"'
    assert updated.json()["name"] == "Product Operations"
    assert updated.json()["revision"] == 2
    assert updated.json()["updated_by_user_id"] is not None
    assert updated.json()["updated_by_name"] == "Dev User"
    assert (await client.get("/api/v1/workspace/profile")).json()["name"] == "Product Operations"


async def test_workspace_profile_admin_authz_and_validation(client, app):
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(text("UPDATE users SET is_admin = false"))

    assert (await client.get("/api/v1/workspace/profile")).status_code == 200
    assert (await client.get("/api/v1/admin/workspace/profile")).status_code == 403
    assert (await update_profile(client, "Denied")).status_code == 403

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(text("UPDATE users SET is_admin = true"))

    for name in ("", "   ", "x" * 81):
        response = await update_profile(client, name)
        assert response.status_code == 422
    missing = await client.patch("/api/v1/admin/workspace/profile", json={"name": "Valid"})
    assert missing.status_code == 428
    assert (
        await client.patch(
            "/api/v1/admin/workspace/profile", json={"name": "Valid"}, headers={"If-Match": 'W/"1"'}
        )
    ).status_code == 422


async def test_workspace_profile_stale_and_concurrent_writers(client):
    first, second = await asyncio.gather(
        update_profile(client, "First"), update_profile(client, "Second")
    )
    assert sorted([first.status_code, second.status_code]) == [200, 412]
    stale = first if first.status_code == 412 else second
    assert stale.headers["etag"] == '"2"'
    assert stale.json()["detail"] == {"code": "stale_revision", "current_revision": 2}
    profile = await client.get("/api/v1/workspace/profile")
    assert profile.headers["etag"] == '"2"'
    assert profile.json()["revision"] == 2


async def test_workspace_logo_upload_read_replace_remove_and_sweep_reference(client, app):
    uploaded = await client.put(
        "/api/v1/admin/workspace/logo",
        content=PNG,
        headers={
            "content-type": "image/png",
            "If-Match": '"1"',
            "X-File-Name": "OneFlow%20mark.png",
        },
    )
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.headers["etag"] == '"2"'
    logo_url = uploaded.json()["logo_url"]
    assert logo_url.startswith("/api/v1/workspace/logo?version=")
    uuid.UUID(logo_url.rsplit("=", 1)[-1])
    assert uploaded.json()["logo_filename"] == "OneFlow mark.png"
    assert uploaded.json()["logo_content_type"] == "image/png"
    assert uploaded.json()["logo_width"] == 2
    assert uploaded.json()["logo_height"] == 2
    assert uploaded.json()["logo_byte_size"] == len(PNG)

    identity = await client.get("/api/v1/workspace/profile")
    assert identity.json()["logo_url"] == logo_url
    logo = await client.get(logo_url)
    assert logo.status_code == 200
    assert logo.content == PNG
    assert logo.headers["content-type"] == "image/png"
    assert logo.headers["x-content-type-options"] == "nosniff"

    async with app.state.sessionmaker() as session:
        row = await session.get(WorkspaceProfile, 1)
        first_key = row.logo_storage_key
        assert first_key is not None
        assert first_key in await _fetch_keys_from_connection(session)
    first_path = Path(app.state.settings.storage_dir) / first_key
    assert first_path.is_file()

    renamed = await update_profile(client, "Delivery Workspace", revision=2)
    assert renamed.status_code == 200
    assert renamed.json()["revision"] == 3
    assert renamed.json()["logo_url"] == logo_url

    stale = await client.put(
        "/api/v1/admin/workspace/logo",
        content=PNG,
        headers={"content-type": "image/png", "If-Match": '"1"'},
    )
    assert stale.status_code == 412
    assert [path for path in first_path.parent.iterdir() if path.is_file()] == [first_path]

    replaced = await client.put(
        "/api/v1/admin/workspace/logo",
        content=PNG,
        headers={"content-type": "image/png", "If-Match": '"3"'},
    )
    assert replaced.status_code == 200
    assert replaced.json()["revision"] == 4
    assert replaced.json()["logo_url"] != logo_url
    assert not first_path.exists()
    assert (await client.get(logo_url)).status_code == 404

    removed = await client.delete(
        "/api/v1/admin/workspace/logo",
        headers={"If-Match": '"4"'},
    )
    assert removed.status_code == 200
    assert removed.json()["revision"] == 5
    assert removed.json()["logo_url"] is None
    assert (await client.get("/api/v1/workspace/logo")).status_code == 404
    async with app.state.sessionmaker() as session:
        assert not (await _fetch_keys_from_connection(session))


async def test_workspace_logo_validation_and_admin_boundary(client, app):
    mismatch = await client.put(
        "/api/v1/admin/workspace/logo",
        content=PNG,
        headers={"content-type": "image/jpeg", "If-Match": '"1"'},
    )
    assert mismatch.status_code == 422
    assert not list(Path(app.state.settings.storage_dir).rglob("*.*"))

    unsupported = await client.put(
        "/api/v1/admin/workspace/logo",
        content=PNG,
        headers={"content-type": "image/gif", "If-Match": '"1"'},
    )
    assert unsupported.status_code == 415
    oversized = await client.put(
        "/api/v1/admin/workspace/logo",
        content=b"x" * (2 * 1024 * 1024 + 1),
        headers={"content-type": "image/png", "If-Match": '"1"'},
    )
    assert oversized.status_code == 413

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(text("UPDATE users SET is_admin = false"))
    denied = await client.put(
        "/api/v1/admin/workspace/logo",
        content=PNG,
        headers={"content-type": "image/png", "If-Match": '"1"'},
    )
    assert denied.status_code == 403
    assert (await client.get("/api/v1/workspace/logo")).status_code == 404


async def test_workspace_calendar_normalizes_values_and_shares_revision(client, app):
    default = await client.get("/api/v1/workspace/calendar")
    assert default.status_code == 200
    assert default.headers["etag"] == '"1"'
    assert default.json()["working_weekdays"] == [0, 1, 2, 3, 4]
    assert default.json()["holidays"] == []

    updated = await client.patch(
        "/api/v1/admin/workspace/calendar",
        json={
            "working_weekdays": [5, 0, 1, 2, 3, 4, 5],
            "holidays": ["2026-07-20", "2026-07-20", "2026-12-25"],
        },
        headers={"If-Match": '"1"'},
    )
    assert updated.status_code == 200, updated.text
    assert updated.headers["etag"] == '"2"'
    assert updated.json()["working_weekdays"] == [0, 1, 2, 3, 4, 5]
    assert updated.json()["holidays"] == ["2026-07-20", "2026-12-25"]

    stale = await client.patch(
        "/api/v1/admin/workspace/calendar",
        json={"working_weekdays": [0, 1, 2, 3, 4], "holidays": []},
        headers={"If-Match": '"1"'},
    )
    assert stale.status_code == 412
    assert stale.json()["detail"] == {"code": "stale_revision", "current_revision": 2}

    invalid = await client.patch(
        "/api/v1/admin/workspace/calendar",
        json={"working_weekdays": [], "holidays": []},
        headers={"If-Match": '"2"'},
    )
    assert invalid.status_code == 422
    invalid_weekday = await client.patch(
        "/api/v1/admin/workspace/calendar",
        json={"working_weekdays": [7], "holidays": []},
        headers={"If-Match": '"2"'},
    )
    assert invalid_weekday.status_code == 422
    invalid_holiday = await client.patch(
        "/api/v1/admin/workspace/calendar",
        json={"working_weekdays": [0], "holidays": ["2026-02-30"]},
        headers={"If-Match": '"2"'},
    )
    assert invalid_holiday.status_code == 422

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(text("UPDATE users SET is_admin = false"))
    assert (await client.get("/api/v1/workspace/calendar")).status_code == 200
    denied = await client.patch(
        "/api/v1/admin/workspace/calendar",
        json={"working_weekdays": [0], "holidays": []},
        headers={"If-Match": '"2"'},
    )
    assert denied.status_code == 403


async def test_workspace_phase_definitions_are_revisioned_and_reordered(client):
    default = await client.get("/api/v1/workspace/project-phase-definitions")
    assert default.status_code == 200
    assert default.headers["etag"] == '"1"'
    assert [item["key"] for item in default.json()["items"]] == [
        "discover",
        "plan",
        "deliver",
        "close",
    ]
    assert [item["position"] for item in default.json()["items"]] == [0, 1, 2, 3]

    payload = {
        "items": [
            {"key": "plan", "name": " 설계 ", "color": "sky"},
            {"key": "discover", "name": "탐색", "color": "indigo"},
            {"key": "deliver", "name": "구현", "color": "emerald"},
            {"key": "close", "name": "완료", "color": "amber"},
        ]
    }
    updated = await client.patch(
        "/api/v1/admin/workspace/project-phase-definitions",
        json=payload,
        headers={"If-Match": '"1"'},
    )
    assert updated.status_code == 200, updated.text
    assert updated.headers["etag"] == '"2"'
    assert [(item["key"], item["name"], item["position"]) for item in updated.json()["items"]] == [
        ("plan", "설계", 0),
        ("discover", "탐색", 1),
        ("deliver", "구현", 2),
        ("close", "완료", 3),
    ]
    assert (await client.get("/api/v1/workspace/calendar")).json()["revision"] == 2

    stale = await client.patch(
        "/api/v1/admin/workspace/project-phase-definitions",
        json=payload,
        headers={"If-Match": '"1"'},
    )
    assert stale.status_code == 412
    assert stale.json()["detail"] == {"code": "stale_revision", "current_revision": 2}


async def test_workspace_phase_definitions_reject_concurrent_writers(client):
    first_payload = {
        "items": [
            {"key": "discover", "name": "탐색", "color": "sky"},
            {"key": "plan", "name": "설계", "color": "indigo"},
            {"key": "deliver", "name": "구현", "color": "emerald"},
            {"key": "close", "name": "종료", "color": "amber"},
        ]
    }
    second_payload = {
        "items": [
            {"key": "plan", "name": "계획", "color": "amber"},
            {"key": "discover", "name": "발견", "color": "emerald"},
            {"key": "deliver", "name": "실행", "color": "indigo"},
            {"key": "close", "name": "마감", "color": "sky"},
        ]
    }

    first, second = await asyncio.gather(
        client.patch(
            "/api/v1/admin/workspace/project-phase-definitions",
            json=first_payload,
            headers={"If-Match": '"1"'},
        ),
        client.patch(
            "/api/v1/admin/workspace/project-phase-definitions",
            json=second_payload,
            headers={"If-Match": '"1"'},
        ),
    )

    assert sorted([first.status_code, second.status_code]) == [200, 412]
    stale = first if first.status_code == 412 else second
    assert stale.headers["etag"] == '"2"'
    assert stale.json()["detail"] == {"code": "stale_revision", "current_revision": 2}
    current = await client.get("/api/v1/workspace/project-phase-definitions")
    assert current.headers["etag"] == '"2"'
    assert current.json()["revision"] == 2


async def test_workspace_phase_definitions_validate_and_require_admin(client, app):
    valid = {
        "items": [
            {"key": "discover", "name": "발견", "color": "sky"},
            {"key": "plan", "name": "계획", "color": "indigo"},
            {"key": "deliver", "name": "실행", "color": "emerald"},
            {"key": "close", "name": "마감", "color": "amber"},
        ]
    }
    missing_match = await client.patch(
        "/api/v1/admin/workspace/project-phase-definitions", json=valid
    )
    assert missing_match.status_code == 428

    invalid_payloads = [
        {"items": valid["items"][:-1]},
        {"items": [*valid["items"][:-1], valid["items"][0]]},
        {"items": [{**valid["items"][0], "name": "   "}, *valid["items"][1:]]},
        {"items": [{**valid["items"][0], "name": "계획"}, *valid["items"][1:]]},
        {"items": [{**valid["items"][0], "color": "red"}, *valid["items"][1:]]},
    ]
    for payload in invalid_payloads:
        response = await client.patch(
            "/api/v1/admin/workspace/project-phase-definitions",
            json=payload,
            headers={"If-Match": '"1"'},
        )
        assert response.status_code == 422

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(text("UPDATE users SET is_admin = false"))
    assert (await client.get("/api/v1/workspace/project-phase-definitions")).status_code == 200
    denied = await client.patch(
        "/api/v1/admin/workspace/project-phase-definitions",
        json=valid,
        headers={"If-Match": '"1"'},
    )
    assert denied.status_code == 403


async def test_workspace_custom_phase_create_retire_restore_and_key_immutability(client):
    created = await client.post(
        "/api/v1/admin/workspace/project-phase-definitions",
        json={"name": "검증", "color": "sky"},
        headers={"If-Match": '"1"'},
    )
    assert created.status_code == 201, created.text
    assert created.headers["etag"] == '"2"'
    custom = created.json()["items"][-1]
    assert custom["key"].startswith("custom_")
    assert len(custom["key"]) == 39
    assert custom["built_in"] is False
    assert custom["retired"] is False
    assert custom["position"] == 4

    duplicate = await client.post(
        "/api/v1/admin/workspace/project-phase-definitions",
        json={"name": " 검증 ", "color": "amber"},
        headers={"If-Match": '"2"'},
    )
    assert duplicate.status_code == 422

    missing_custom = await client.patch(
        "/api/v1/admin/workspace/project-phase-definitions",
        json={
            "items": [
                {"key": item["key"], "name": item["name"], "color": item["color"]}
                for item in created.json()["items"]
                if item["key"] != custom["key"]
            ]
        },
        headers={"If-Match": '"2"'},
    )
    assert missing_custom.status_code == 422
    assert missing_custom.json()["detail"] == (
        "items must contain every current phase key exactly once"
    )

    built_in = await client.post(
        "/api/v1/admin/workspace/project-phase-definitions/discover/retire",
        headers={"If-Match": '"2"'},
    )
    assert built_in.status_code == 422
    retired = await client.post(
        f"/api/v1/admin/workspace/project-phase-definitions/{custom['key']}/retire",
        headers={"If-Match": '"2"'},
    )
    assert retired.status_code == 200, retired.text
    assert retired.headers["etag"] == '"3"'
    assert retired.json()["items"][-1]["retired"] is True

    retired_noop = await client.post(
        f"/api/v1/admin/workspace/project-phase-definitions/{custom['key']}/retire",
        headers={"If-Match": '"3"'},
    )
    assert retired_noop.status_code == 200
    assert retired_noop.headers["etag"] == '"3"'

    restored = await client.post(
        f"/api/v1/admin/workspace/project-phase-definitions/{custom['key']}/restore",
        headers={"If-Match": '"3"'},
    )
    assert restored.status_code == 200, restored.text
    assert restored.headers["etag"] == '"4"'
    restored_custom = next(
        item for item in restored.json()["items"] if item["key"] == custom["key"]
    )
    assert restored_custom["retired"] is False
    assert restored_custom["position"] == 4


async def test_workspace_custom_phase_mutations_require_admin_and_match(client, app):
    missing_match = await client.post(
        "/api/v1/admin/workspace/project-phase-definitions",
        json={"name": "검증", "color": "sky"},
    )
    assert missing_match.status_code == 428
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(text("UPDATE users SET is_admin = false"))
    denied = await client.post(
        "/api/v1/admin/workspace/project-phase-definitions",
        json={"name": "검증", "color": "sky"},
        headers={"If-Match": '"1"'},
    )
    assert denied.status_code == 403


async def test_workspace_custom_phase_active_bound_applies_to_create_and_restore(client):
    custom_keys: list[str] = []
    revision = 1
    for index in range(8):
        response = await client.post(
            "/api/v1/admin/workspace/project-phase-definitions",
            json={"name": f"Custom {index + 1}", "color": "sky"},
            headers={"If-Match": f'"{revision}"'},
        )
        assert response.status_code == 201, response.text
        revision += 1
        custom_keys.append(response.json()["items"][3 + index + 1]["key"])

    overflow = await client.post(
        "/api/v1/admin/workspace/project-phase-definitions",
        json={"name": "Custom 9", "color": "amber"},
        headers={"If-Match": f'"{revision}"'},
    )
    assert overflow.status_code == 422
    assert overflow.json()["detail"] == "active phases cannot exceed 12"

    retired = await client.post(
        f"/api/v1/admin/workspace/project-phase-definitions/{custom_keys[0]}/retire",
        headers={"If-Match": f'"{revision}"'},
    )
    assert retired.status_code == 200
    revision += 1
    replacement = await client.post(
        "/api/v1/admin/workspace/project-phase-definitions",
        json={"name": "Replacement", "color": "amber"},
        headers={"If-Match": f'"{revision}"'},
    )
    assert replacement.status_code == 201
    revision += 1
    restore_overflow = await client.post(
        f"/api/v1/admin/workspace/project-phase-definitions/{custom_keys[0]}/restore",
        headers={"If-Match": f'"{revision}"'},
    )
    assert restore_overflow.status_code == 422
    assert restore_overflow.json()["detail"] == "active phases cannot exceed 12"
