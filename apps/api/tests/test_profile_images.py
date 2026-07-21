"""Authenticated personal profile-image lifecycle contracts."""

import asyncio
import base64
import uuid
from pathlib import Path

from app.models.user import User
from app.services.storage_sweep import _fetch_keys_from_connection

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPkndLBwMDAxAAGAA2bAS37E8jFAAAAAElFTkSuQmCC"
)


def image_headers(revision: int, filename: str = "Profile%20photo.png") -> dict[str, str]:
    return {
        "content-type": "image/png",
        "If-Match": f'"{revision}"',
        "X-File-Name": filename,
    }


async def test_me_default_profile_image_contract(client):
    response = await client.get("/api/v1/me")
    assert response.status_code == 200
    assert response.json() == {
        "id": response.json()["id"],
        "email": "dev@oneflow.local",
        "display_name": "Dev User",
        "is_active": True,
        "is_admin": True,
        "profile_image_url": None,
        "profile_image_content_type": None,
        "profile_image_filename": None,
        "profile_image_width": None,
        "profile_image_height": None,
        "profile_image_byte_size": None,
        "profile_revision": 1,
    }
    assert (await client.get("/api/v1/me/profile-image")).status_code == 404


async def test_profile_image_upload_read_replace_remove_and_sweep(client, app):
    uploaded = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers=image_headers(1),
    )
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.headers["etag"] == '"2"'
    item = uploaded.json()
    image_url = item["profile_image_url"]
    assert image_url.startswith("/api/v1/me/profile-image?version=")
    uuid.UUID(image_url.rsplit("=", 1)[-1])
    assert item["profile_image_filename"] == "Profile photo.png"
    assert item["profile_image_content_type"] == "image/png"
    assert item["profile_image_width"] == 2
    assert item["profile_image_height"] == 2
    assert item["profile_image_byte_size"] == len(PNG)
    assert item["profile_revision"] == 2
    assert (await client.get("/api/v1/me")).json()["profile_image_url"] == image_url

    image = await client.get(image_url)
    assert image.status_code == 200
    assert image.content == PNG
    assert image.headers["content-type"] == "image/png"
    assert image.headers["cache-control"] == "private, max-age=31536000, immutable"
    assert image.headers["x-content-type-options"] == "nosniff"

    async with app.state.sessionmaker() as session:
        row = await session.get(User, uuid.UUID(item["id"]))
        first_key = row.profile_image_storage_key
        assert first_key is not None
        assert first_key in await _fetch_keys_from_connection(session)
    first_path = Path(app.state.settings.storage_dir) / first_key
    assert first_path.is_file()

    replaced = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers=image_headers(2, "replacement.png"),
    )
    assert replaced.status_code == 200, replaced.text
    assert replaced.json()["profile_revision"] == 3
    assert replaced.json()["profile_image_url"] != image_url
    assert not first_path.exists()
    assert (await client.get(image_url)).status_code == 404

    removed = await client.delete(
        "/api/v1/me/profile-image",
        headers={"If-Match": '"3"'},
    )
    assert removed.status_code == 200
    assert removed.headers["etag"] == '"4"'
    assert removed.json()["profile_revision"] == 4
    assert removed.json()["profile_image_url"] is None
    async with app.state.sessionmaker() as session:
        assert not (await _fetch_keys_from_connection(session))

    idempotent = await client.delete(
        "/api/v1/me/profile-image",
        headers={"If-Match": '"4"'},
    )
    assert idempotent.status_code == 200
    assert idempotent.json()["profile_revision"] == 4


async def test_profile_image_validation_and_stale_cleanup(client, app):
    mismatch = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers={**image_headers(1), "content-type": "image/jpeg"},
    )
    assert mismatch.status_code == 422
    unsupported = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers={**image_headers(1), "content-type": "image/gif"},
    )
    assert unsupported.status_code == 415
    empty = await client.put("/api/v1/me/profile-image", content=b"", headers=image_headers(1))
    assert empty.status_code == 422
    oversized = await client.put(
        "/api/v1/me/profile-image",
        content=b"x" * (2 * 1024 * 1024 + 1),
        headers=image_headers(1),
    )
    assert oversized.status_code == 413
    assert not [path for path in Path(app.state.settings.storage_dir).rglob("*") if path.is_file()]

    uploaded = await client.put("/api/v1/me/profile-image", content=PNG, headers=image_headers(1))
    assert uploaded.status_code == 200
    stale = await client.put("/api/v1/me/profile-image", content=PNG, headers=image_headers(1))
    assert stale.status_code == 412
    assert stale.headers["etag"] == '"2"'
    assert stale.json()["detail"] == {"code": "stale_revision", "current_revision": 2}
    files = [path for path in Path(app.state.settings.storage_dir).rglob("*") if path.is_file()]
    assert len(files) == 1


async def test_profile_image_concurrent_replacement_is_compare_and_swap(client, app):
    first, second = await asyncio.gather(
        client.put("/api/v1/me/profile-image", content=PNG, headers=image_headers(1, "one.png")),
        client.put("/api/v1/me/profile-image", content=PNG, headers=image_headers(1, "two.png")),
    )
    assert sorted([first.status_code, second.status_code]) == [200, 412]
    winner = first if first.status_code == 200 else second
    assert winner.json()["profile_revision"] == 2
    files = [path for path in Path(app.state.settings.storage_dir).rglob("*") if path.is_file()]
    assert len(files) == 1
