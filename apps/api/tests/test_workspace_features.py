"""Workspace feature policy contracts for the Wiki surface."""

import asyncio

from sqlalchemy import text

from tests.conftest import create_project, create_wp


async def set_wiki(client, enabled: bool, revision: int = 1):
    return await client.patch(
        "/api/v1/admin/workspace/features/wiki",
        json={"enabled": enabled},
        headers={"If-Match": f'"{revision}"'},
    )


async def test_wiki_policy_defaults_and_admin_contract(client):
    capabilities = await client.get("/api/v1/workspace/capabilities")
    assert capabilities.status_code == 200
    assert capabilities.json() == {
        "wiki": {"enabled": True, "revision": 1},
        "ai": {
            "enabled": False,
            "revision": 1,
            "deployment_enabled": False,
            "effective_enabled": False,
        },
    }

    policy = await client.get("/api/v1/admin/workspace/features/wiki")
    assert policy.status_code == 200
    assert policy.headers["etag"] == '"1"'
    assert policy.json()["feature_key"] == "wiki"
    assert policy.json()["enabled"] is True
    assert policy.json()["updated_by_user_id"] is None

    missing = await client.patch("/api/v1/admin/workspace/features/wiki", json={"enabled": False})
    assert missing.status_code == 428
    malformed = await client.patch(
        "/api/v1/admin/workspace/features/wiki",
        json={"enabled": False},
        headers={"If-Match": "not-a-revision"},
    )
    assert malformed.status_code == 422
    weak = await client.patch(
        "/api/v1/admin/workspace/features/wiki",
        json={"enabled": False},
        headers={"If-Match": 'W/"1"'},
    )
    assert weak.status_code == 422
    for invalid in ("1", '"1', '1"', '""1""', '"1","2"', '"0"', "*"):
        response = await client.patch(
            "/api/v1/admin/workspace/features/wiki",
            json={"enabled": False},
            headers={"If-Match": invalid},
        )
        assert response.status_code == 422, invalid

    updated = await set_wiki(client, False)
    assert updated.status_code == 200, updated.text
    assert updated.headers["etag"] == '"2"'
    assert updated.json()["enabled"] is False
    assert updated.json()["revision"] == 2
    assert updated.json()["updated_by_name"] == "Dev User"
    assert updated.json()["updated_by_user_id"] is not None
    assert (await client.get("/api/v1/workspace/capabilities")).json() == {
        "wiki": {"enabled": False, "revision": 2},
        "ai": {
            "enabled": False,
            "revision": 1,
            "deployment_enabled": False,
            "effective_enabled": False,
        },
    }

    stale = await set_wiki(client, True)
    assert stale.status_code == 412
    assert stale.headers["etag"] == '"2"'
    assert stale.json()["detail"] == {"code": "stale_revision", "current_revision": 2}


async def test_wiki_policy_is_admin_only(client, app):
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(text("UPDATE users SET is_admin = false"))

    assert (await client.get("/api/v1/workspace/capabilities")).status_code == 200
    assert (await client.get("/api/v1/admin/workspace/features/wiki")).status_code == 403
    assert (await set_wiki(client, False)).status_code == 403
    assert (await client.get("/api/v1/admin/workspace/features/ai")).status_code == 403
    assert (
        await client.patch(
            "/api/v1/admin/workspace/features/ai",
            json={"enabled": False},
            headers={"If-Match": '"1"'},
        )
    ).status_code == 403


async def test_wiki_policy_compare_and_swap_allows_one_writer(client):
    first, second = await asyncio.gather(set_wiki(client, False), set_wiki(client, False))
    assert sorted([first.status_code, second.status_code]) == [200, 412]
    policy = await client.get("/api/v1/admin/workspace/features/wiki")
    assert policy.json()["revision"] == 2
    assert policy.json()["enabled"] is False


async def test_disabled_wiki_blocks_document_routes_and_preserves_data(client):
    project = await create_project(client, key="WIKI", name="Wiki policy")
    pid = project["id"]
    wp = await create_wp(client, pid, subject="Wiki-linked work")
    document = (
        await client.post(
            f"/api/v1/projects/{pid}/documents",
            json={"title": "Persisted page", "body": "<p>Keep me</p>"},
        )
    ).json()

    assert (await set_wiki(client, False)).status_code == 200
    blocked_requests = [
        client.get(f"/api/v1/projects/{pid}/documents"),
        client.post(f"/api/v1/projects/{pid}/documents", json={"title": "Blocked"}),
        client.get(f"/api/v1/documents/{document['id']}"),
        client.patch(
            f"/api/v1/documents/{document['id']}",
            json={"expected_version": 0, "title": "Blocked"},
        ),
        client.delete(f"/api/v1/documents/{document['id']}"),
        client.get(f"/api/v1/documents/{document['id']}/comments"),
        client.get(f"/api/v1/documents/{document['id']}/work-package-links"),
        client.get(f"/api/v1/work-packages/{wp['id']}/documents"),
    ]
    responses = await asyncio.gather(*blocked_requests)
    for response in responses:
        assert response.status_code == 403, response.text
        assert response.json()["detail"] == {"code": "feature_disabled", "feature": "wiki"}

    reenabled = await set_wiki(client, True, revision=2)
    assert reenabled.status_code == 200, reenabled.text
    fetched = await client.get(f"/api/v1/documents/{document['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "Persisted page"
    assert fetched.json()["body"] == "<p>Keep me</p>"


async def test_disabled_wiki_omits_search_and_blocks_only_document_attachment_writes(client):
    project = await create_project(client, key="WSEA", name="Wiki search")
    pid = project["id"]
    await create_wp(client, pid, subject="Shared policy token")
    document = (
        await client.post(
            f"/api/v1/projects/{pid}/documents", json={"title": "Shared policy token"}
        )
    ).json()
    attachment = (
        await client.post(
            f"/api/v1/projects/{pid}/attachments",
            json={
                "filename": "existing.txt",
                "url": "https://example.com/existing.txt",
                "document_id": document["id"],
            },
        )
    ).json()

    assert (await set_wiki(client, False)).status_code == 200
    search = await client.get("/api/v1/search?q=Shared%20policy%20token")
    assert search.status_code == 200
    assert search.json()["work_packages"]["returned"] == 1
    assert search.json()["documents"] == {"items": [], "returned": 0, "truncated": False}

    blocked = await client.post(
        f"/api/v1/projects/{pid}/attachments",
        json={
            "filename": "blocked.txt",
            "url": "https://example.com/blocked.txt",
            "document_id": document["id"],
        },
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == {"code": "feature_disabled", "feature": "wiki"}
    upload = await client.post(
        f"/api/v1/projects/{pid}/attachments/upload"
        f"?filename=blocked.txt&document_id={document['id']}",
        content=b"blocked",
        headers={"content-type": "text/plain", "content-length": "7"},
    )
    assert upload.status_code == 403

    plain = await client.post(
        f"/api/v1/projects/{pid}/attachments",
        json={"filename": "plain.txt", "url": "https://example.com/plain.txt"},
    )
    assert plain.status_code == 201
    assert (await client.delete(f"/api/v1/attachments/{attachment['id']}")).status_code == 204
