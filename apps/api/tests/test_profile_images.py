"""Authenticated personal profile-image lifecycle contracts."""

import asyncio
import base64
import uuid
from pathlib import Path

from sqlalchemy import delete, select

from app.core.auth import DEV_USER_EMAIL
from app.models.initiative import Initiative, InitiativeActivity, InitiativeProject
from app.models.member import ProjectMember
from app.models.user import User
from app.services.storage_sweep import _fetch_keys_from_connection
from tests.conftest import create_project, create_wp

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


async def test_project_collaboration_profile_image_urls_are_versioned_and_member_scoped(
    client,
    app,
    member_project,
    foreign_project,
):
    project = await create_project(client, key="AVI", name="Avatar project")
    uploaded = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers=image_headers(1),
    )
    assert uploaded.status_code == 200
    me = uploaded.json()

    roster = await client.get(f"/api/v1/projects/{project['id']}/members")
    assert roster.status_code == 200
    member = roster.json()["items"][0]
    member_url = member["profile_image_url"]
    assert member_url.startswith(
        f"/api/v1/projects/{project['id']}/members/{me['id']}/profile-image?version="
    )
    member_image = await client.get(member_url)
    assert member_image.content == PNG
    assert member_image.headers["cache-control"] == "private, no-store"

    work_package = await create_wp(client, project["id"], subject="Avatar watcher")
    assert (
        await client.put(f"/api/v1/work-packages/{work_package['id']}/watchers/me")
    ).status_code == 204
    watcher_list = await client.get(f"/api/v1/work-packages/{work_package['id']}/watchers")
    assert watcher_list.status_code == 200
    watcher = watcher_list.json()["items"][0]
    assert watcher["profile_image_url"] == member_url

    owner_version = uuid.uuid4()
    owner_key = f"{member_project['owner_id']}/{owner_version}"
    owner_path = Path(app.state.settings.storage_dir) / owner_key
    owner_path.parent.mkdir(parents=True, exist_ok=True)
    owner_path.write_bytes(PNG)
    async with app.state.sessionmaker() as session, session.begin():
        owner = await session.get(User, member_project["owner_id"])
        assert owner is not None
        owner.profile_image_storage_key = owner_key
        owner.profile_image_content_type = "image/png"
        owner.profile_image_filename = "owner.png"
        owner.profile_image_width = 2
        owner.profile_image_height = 2
        owner.profile_image_byte_size = len(PNG)

    shared_roster = await client.get(f"/api/v1/projects/{member_project['project_id']}/members")
    assert shared_roster.status_code == 200
    owner_member = next(
        item
        for item in shared_roster.json()["items"]
        if item["user_id"] == str(member_project["owner_id"])
    )
    assert owner_member["profile_image_url"].endswith(f"version={owner_version}")
    owner_image = await client.get(owner_member["profile_image_url"])
    assert owner_image.content == PNG
    assert owner_image.headers["cache-control"] == "private, no-store"

    version = member_url.rsplit("=", 1)[-1]
    foreign_read = await client.get(
        f"/api/v1/projects/{foreign_project['project_id']}/members/"
        f"{foreign_project['user_id']}/profile-image?version={version}"
    )
    assert foreign_read.status_code == 404

    replacement = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers=image_headers(2, "replacement.png"),
    )
    assert replacement.status_code == 200
    assert (await client.get(member_url)).status_code == 404
    refreshed = await client.get(f"/api/v1/projects/{project['id']}/members")
    assert refreshed.json()["items"][0]["profile_image_url"] != member_url


async def test_comment_and_activity_actor_images_remain_immutable_after_profile_changes(
    client, app, foreign_project
):
    uploaded = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers=image_headers(1, "history.png"),
    )
    assert uploaded.status_code == 200
    old_self_url = uploaded.json()["profile_image_url"]
    project = await create_project(client, key="HIS", name="History avatar")
    work_package = await create_wp(client, project["id"], subject="Immutable actor")
    comment = await client.post(
        f"/api/v1/work-packages/{work_package['id']}/comments",
        json={"body": "Snapshot me"},
    )
    assert comment.status_code == 201
    comment_item = comment.json()
    assert comment_item["author_name"] == "Dev User"
    comment_image_url = comment_item["author_profile_image_url"]
    assert comment_image_url is not None

    activities = await client.get(f"/api/v1/work-packages/{work_package['id']}/activities")
    assert activities.status_code == 200
    activity_items = activities.json()["items"]
    assert {item["actor_name"] for item in activity_items} == {"Dev User"}
    activity_image_urls = [
        item["actor_profile_image_url"]
        for item in activity_items
        if item["actor_profile_image_url"] is not None
    ]
    assert len(activity_image_urls) == len(activity_items)

    async with app.state.sessionmaker() as session, session.begin():
        row = await session.get(User, uuid.UUID(uploaded.json()["id"]))
        assert row is not None and row.profile_image_storage_key is not None
        old_key = row.profile_image_storage_key
        row.display_name = "Renamed User"
    old_path = Path(app.state.settings.storage_dir) / old_key

    replaced = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers=image_headers(2, "new.png"),
    )
    assert replaced.status_code == 200
    assert old_path.is_file()
    assert (await client.get(old_self_url)).status_code == 404

    listed_comments = await client.get(
        f"/api/v1/work-packages/{work_package['id']}/comment-threads"
    )
    listed_comment = listed_comments.json()["items"][0]["root"]
    assert listed_comment["author_name"] == "Dev User"
    assert listed_comment["author_profile_image_url"] == comment_image_url
    comment_image = await client.get(comment_image_url)
    assert comment_image.status_code == 200
    assert comment_image.content == PNG
    assert comment_image.headers["cache-control"] == "private, no-store"

    listed_activities = await client.get(f"/api/v1/work-packages/{work_package['id']}/activities")
    assert {item["actor_name"] for item in listed_activities.json()["items"]} == {"Dev User"}
    for image_url in activity_image_urls:
        image = await client.get(image_url)
        assert image.status_code == 200
        assert image.content == PNG
        assert image.headers["cache-control"] == "private, no-store"

    wrong_version = comment_image_url.rsplit("=", 1)[0] + f"={uuid.uuid4()}"
    assert (await client.get(wrong_version)).status_code == 404
    foreign_scope = comment_image_url.replace(
        str(work_package["id"]), str(foreign_project["wp_id"]), 1
    )
    assert (await client.get(foreign_scope)).status_code == 404

    removed = await client.delete("/api/v1/me/profile-image", headers={"If-Match": '"3"'})
    assert removed.status_code == 200
    async with app.state.sessionmaker() as session:
        known_keys = await _fetch_keys_from_connection(session)
    assert old_key in known_keys
    assert old_path.is_file()

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            delete(ProjectMember).where(
                ProjectMember.project_id == uuid.UUID(project["id"]),
                ProjectMember.user_id == uuid.UUID(uploaded.json()["id"]),
            )
        )
    assert (await client.get(comment_image_url)).status_code == 404

    async with app.state.sessionmaker() as session, session.begin():
        actor = (
            await session.execute(select(User).where(User.email == DEV_USER_EMAIL))
        ).scalar_one()
        session.add(
            ProjectMember(project_id=uuid.UUID(project["id"]), user_id=actor.id, role="owner")
        )
    assert (await client.get(comment_image_url)).status_code == 200

    async with app.state.sessionmaker() as session, session.begin():
        actor = (
            await session.execute(select(User).where(User.email == DEV_USER_EMAIL))
        ).scalar_one()
        await session.delete(actor)
        await session.flush()
        reader = User(email=DEV_USER_EMAIL, display_name="Replacement Reader", is_admin=True)
        session.add(reader)
        await session.flush()
        session.add(
            ProjectMember(project_id=uuid.UUID(project["id"]), user_id=reader.id, role="owner")
        )

    deleted_actor_comments = await client.get(
        f"/api/v1/work-packages/{work_package['id']}/comment-threads"
    )
    deleted_actor_comment = deleted_actor_comments.json()["items"][0]["root"]
    assert deleted_actor_comment["author_id"] is None
    assert deleted_actor_comment["author_name"] == "Dev User"
    assert deleted_actor_comment["author_profile_image_url"] == comment_image_url
    assert (await client.get(comment_image_url)).content == PNG

    deleted_actor_activities = await client.get(
        f"/api/v1/work-packages/{work_package['id']}/activities"
    )
    assert all(item["actor_id"] is None for item in deleted_actor_activities.json()["items"])
    assert {item["actor_name"] for item in deleted_actor_activities.json()["items"]} == {"Dev User"}
    for item in deleted_actor_activities.json()["items"]:
        assert (await client.get(item["actor_profile_image_url"])).content == PNG


async def test_document_comment_actor_image_remains_immutable_and_member_scoped(client, app):
    uploaded = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers=image_headers(1, "document-history.png"),
    )
    assert uploaded.status_code == 200
    project = await create_project(client, key="DAV", name="Document avatar")
    document = await client.post(
        f"/api/v1/projects/{project['id']}/documents",
        json={"title": "Identity history", "body": "<p>History</p>"},
    )
    assert document.status_code == 201
    document_id = document.json()["id"]
    created = await client.post(
        f"/api/v1/documents/{document_id}/comments",
        json={"body": "Keep my identity"},
    )
    assert created.status_code == 201
    item = created.json()
    assert item["author_name"] == "Dev User"
    image_url = item["author_profile_image_url"]
    assert image_url.startswith(f"/api/v1/documents/{document_id}/comments/{item['id']}")

    async with app.state.sessionmaker() as session, session.begin():
        actor = await session.get(User, uuid.UUID(uploaded.json()["id"]))
        assert actor is not None and actor.profile_image_storage_key is not None
        old_key = actor.profile_image_storage_key
        actor.display_name = "Renamed User"

    replaced = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers=image_headers(2, "replacement.png"),
    )
    assert replaced.status_code == 200
    old_path = Path(app.state.settings.storage_dir) / old_key
    assert old_path.is_file()

    listed = await client.get(f"/api/v1/documents/{document_id}/comments")
    historical = listed.json()["items"][0]
    assert historical["author_name"] == "Dev User"
    assert historical["author_profile_image_url"] == image_url
    image = await client.get(image_url)
    assert image.status_code == 200
    assert image.content == PNG
    assert image.headers["cache-control"] == "private, no-store"

    wrong_version = image_url.rsplit("=", 1)[0] + f"={uuid.uuid4()}"
    assert (await client.get(wrong_version)).status_code == 404
    wrong_document = image_url.replace(document_id, str(uuid.uuid4()), 1)
    assert (await client.get(wrong_document)).status_code == 404

    removed = await client.delete("/api/v1/me/profile-image", headers={"If-Match": '"3"'})
    assert removed.status_code == 200
    async with app.state.sessionmaker() as session:
        assert old_key in await _fetch_keys_from_connection(session)
    assert old_path.is_file()

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            delete(ProjectMember).where(
                ProjectMember.project_id == uuid.UUID(project["id"]),
                ProjectMember.user_id == uuid.UUID(uploaded.json()["id"]),
            )
        )
    assert (await client.get(image_url)).status_code == 404


async def test_initiative_activity_actor_image_remains_immutable_and_visibility_scoped(
    client, app, member_project
):
    uploaded = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers=image_headers(1, "initiative-history.png"),
    )
    assert uploaded.status_code == 200
    async with app.state.sessionmaker() as session, session.begin():
        actor = await session.get(User, member_project["dev_id"])
        assert actor is not None and actor.profile_image_storage_key is not None
        old_key = actor.profile_image_storage_key
        initiative = Initiative(name="Initiative identity", owner_id=member_project["owner_id"])
        session.add(initiative)
        await session.flush()
        activity = InitiativeActivity(
            initiative_id=initiative.id,
            actor_id=actor.id,
            actor_name_snapshot=actor.display_name,
            actor_profile_image_storage_key=actor.profile_image_storage_key,
            actor_profile_image_content_type=actor.profile_image_content_type,
            kind="initiative_created",
            changed_fields=["name", "state"],
        )
        session.add_all(
            [
                InitiativeProject(
                    initiative_id=initiative.id,
                    project_id=member_project["project_id"],
                ),
                activity,
            ]
        )
        initiative_id = str(initiative.id)

    listed = await client.get(f"/api/v1/initiatives/{initiative_id}/activities")
    assert listed.status_code == 200
    historical = listed.json()["items"][0]
    assert historical["actor_name"] == "Dev User"
    image_url = historical["actor_profile_image_url"]
    assert image_url.startswith(f"/api/v1/initiatives/{initiative_id}/activities/")

    async with app.state.sessionmaker() as session, session.begin():
        actor = await session.get(User, member_project["dev_id"])
        assert actor is not None
        actor.display_name = "Renamed User"
    replaced = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers=image_headers(2, "replacement.png"),
    )
    assert replaced.status_code == 200
    old_path = Path(app.state.settings.storage_dir) / old_key
    assert old_path.is_file()

    listed = await client.get(f"/api/v1/initiatives/{initiative_id}/activities")
    assert listed.json()["items"][0]["actor_name"] == "Dev User"
    assert listed.json()["items"][0]["actor_profile_image_url"] == image_url
    image = await client.get(image_url)
    assert image.status_code == 200
    assert image.content == PNG
    assert image.headers["cache-control"] == "private, no-store"

    wrong_version = image_url.rsplit("=", 1)[0] + f"={uuid.uuid4()}"
    assert (await client.get(wrong_version)).status_code == 404
    wrong_initiative = image_url.replace(initiative_id, str(uuid.uuid4()), 1)
    assert (await client.get(wrong_initiative)).status_code == 404

    removed = await client.delete("/api/v1/me/profile-image", headers={"If-Match": '"3"'})
    assert removed.status_code == 200
    async with app.state.sessionmaker() as session:
        assert old_key in await _fetch_keys_from_connection(session)
    assert old_path.is_file()

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            delete(ProjectMember).where(
                ProjectMember.project_id == member_project["project_id"],
                ProjectMember.user_id == member_project["dev_id"],
            )
        )
    assert (await client.get(image_url)).status_code == 404


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
