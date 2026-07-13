"""Project cover persistence, media validation, authorization, and cleanup."""

import asyncio
import base64
import io
import threading
import time
import uuid

import pytest
from PIL import Image
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.models import Project
from tests.conftest import create_project

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPkndLBwMDAxAAGAA2bAS37E8jFAAAAAElFTkSuQmCC"
)


def _truncated_image(image_format: str) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (64, 64), (20, 40, 60)).save(output, format=image_format)
    trim = 1 if image_format == "JPEG" else 3
    return output.getvalue()[:-trim]


async def _upload(
    client,
    project_id: str,
    content_type: str = "image/png",
    content: bytes = PNG,
) -> dict:
    response = await client.post(
        f"/api/v1/projects/{project_id}/attachments/upload?filename=cover.png",
        content=content,
        headers={"content-type": content_type},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_project_cover_roundtrip_list_and_attachment_cleanup(client):
    project = await create_project(client, key="COVER")
    assert project["cover_attachment_id"] is None
    attachment = await _upload(client, project["id"])

    updated = await client.patch(
        f"/api/v1/projects/{project['id']}",
        json={"cover_attachment_id": attachment["id"]},
    )
    assert updated.status_code == 200
    assert updated.json()["cover_attachment_id"] == attachment["id"]
    assert (await client.get("/api/v1/projects")).json()["items"][0][
        "cover_attachment_id"
    ] == attachment["id"]

    cleared = await client.patch(
        f"/api/v1/projects/{project['id']}", json={"cover_attachment_id": None}
    )
    assert cleared.status_code == 200
    assert cleared.json()["cover_attachment_id"] is None
    restored = await client.patch(
        f"/api/v1/projects/{project['id']}",
        json={"cover_attachment_id": attachment["id"]},
    )
    assert restored.status_code == 200

    deleted = await client.delete(f"/api/v1/attachments/{attachment['id']}")
    assert deleted.status_code == 204
    current = await client.get(f"/api/v1/projects/{project['id']}")
    assert current.json()["cover_attachment_id"] is None


async def test_project_cover_accepts_only_same_project_uploaded_raster(app, client):
    first = await create_project(client, key="FIRST")
    second = await create_project(client, key="SECOND")
    foreign_image = await _upload(client, second["id"])
    text_file = await _upload(client, first["id"], "text/plain")
    corrupt_image = await _upload(
        client,
        first["id"],
        content=b"\x89PNG\r\n\x1a\ntruncated-image",
    )
    mismatched_image = await _upload(client, first["id"], "image/jpeg")
    truncated_jpeg = await _upload(
        client,
        first["id"],
        "image/jpeg",
        _truncated_image("JPEG"),
    )
    truncated_gif = await _upload(
        client,
        first["id"],
        "image/gif",
        _truncated_image("GIF"),
    )

    for attachment_id in (
        foreign_image["id"],
        text_file["id"],
        corrupt_image["id"],
        mismatched_image["id"],
        truncated_jpeg["id"],
        truncated_gif["id"],
    ):
        response = await client.patch(
            f"/api/v1/projects/{first['id']}",
            json={"cover_attachment_id": attachment_id},
        )
        assert response.status_code == 422
        assert "uploaded raster image" in response.json()["detail"]

    with pytest.raises(IntegrityError):
        async with app.state.sessionmaker() as session, session.begin():
            await session.execute(
                update(Project)
                .where(Project.id == uuid.UUID(first["id"]))
                .values(cover_attachment_id=uuid.UUID(foreign_image["id"]))
            )


async def test_project_cover_is_owner_only(client, member_project):
    attachment = await _upload(client, str(member_project["project_id"]))
    response = await client.patch(
        f"/api/v1/projects/{member_project['project_id']}",
        json={"cover_attachment_id": attachment["id"]},
    )
    assert response.status_code == 403


async def test_project_cover_decode_does_not_block_event_loop(client, monkeypatch):
    project = await create_project(client, key="ASYNC")
    attachment = await _upload(client, project["id"])
    started = threading.Event()
    release = threading.Event()

    def slow_decode(*_args):
        started.set()
        release.wait(timeout=1)
        return True

    monkeypatch.setattr("app.api.v1.projects._valid_cover_blob", slow_decode)
    started_at = time.perf_counter()
    request = asyncio.create_task(
        client.patch(
            f"/api/v1/projects/{project['id']}",
            json={"cover_attachment_id": attachment["id"]},
        )
    )
    for _ in range(100):
        if started.is_set():
            break
        await asyncio.sleep(0.005)
    elapsed = time.perf_counter() - started_at
    release.set()

    response = await request
    assert started.is_set()
    assert elapsed < 0.25
    assert response.status_code == 200


async def test_archived_project_cover_is_read_only(client):
    project = await create_project(client, key="ARCHCOVER")
    attachment = await _upload(client, project["id"])
    assert (await client.post(f"/api/v1/projects/{project['id']}/archive")).status_code == 200

    response = await client.patch(
        f"/api/v1/projects/{project['id']}",
        json={"cover_attachment_id": attachment["id"]},
    )
    assert response.status_code == 409


async def test_member_cannot_delete_active_project_cover(app, client, member_project):
    project_id = str(member_project["project_id"])
    attachment = await _upload(client, project_id)
    async with app.state.sessionmaker() as session, session.begin():
        project = await session.get(Project, uuid.UUID(project_id))
        assert project is not None
        project.cover_attachment_id = uuid.UUID(attachment["id"])

    response = await client.delete(f"/api/v1/attachments/{attachment['id']}")
    assert response.status_code == 403
    current = await client.get(f"/api/v1/projects/{project_id}")
    assert current.json()["cover_attachment_id"] == attachment["id"]


async def test_cover_set_and_member_delete_are_serialized(app, client, member_project):
    project_id = uuid.UUID(str(member_project["project_id"]))
    attachment = await _upload(client, str(project_id))
    attachment_id = uuid.UUID(attachment["id"])

    async with app.state.sessionmaker() as session, session.begin():
        project = (
            await session.execute(select(Project).where(Project.id == project_id).with_for_update())
        ).scalar_one()
        deletion = asyncio.create_task(client.delete(f"/api/v1/attachments/{attachment_id}"))
        await asyncio.sleep(0.05)
        assert not deletion.done()
        project.cover_attachment_id = attachment_id

    response = await asyncio.wait_for(deletion, timeout=2)
    assert response.status_code == 403
    current = await client.get(f"/api/v1/projects/{project_id}")
    assert current.json()["cover_attachment_id"] == str(attachment_id)
