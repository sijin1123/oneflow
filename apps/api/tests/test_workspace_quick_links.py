import asyncio
import uuid

from app.models import User, WorkspaceQuickLink


async def _create(client, title: str, destination: str):
    response = await client.post(
        "/api/v1/me/quick-links",
        json={"title": title, "destination": destination},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_workspace_quick_links_crud_and_order(client):
    docs = await _create(client, "  제품 문서  ", "https://docs.example.com/guide")
    project = await _create(client, "프로젝트", "/projects?layout=grid")
    assert docs["title"] == "제품 문서"
    assert docs["destination"] == "https://docs.example.com/guide"

    updated = await client.patch(
        f"/api/v1/me/quick-links/{docs['id']}",
        json={
            "expected_version": docs["version"],
            "title": "팀 문서",
            "destination": "https://docs.example.com/handbook#start",
        },
    )
    assert updated.status_code == 200, updated.text
    docs = updated.json()
    assert docs["version"] == 1

    ordered = await client.put(
        "/api/v1/me/quick-links/order",
        json={
            "items": [
                {"id": project["id"], "expected_version": project["version"]},
                {"id": docs["id"], "expected_version": docs["version"]},
            ]
        },
    )
    assert ordered.status_code == 200, ordered.text
    payload = ordered.json()
    assert [item["id"] for item in payload["items"]] == [project["id"], docs["id"]]
    assert [item["position"] for item in payload["items"]] == [0, 1]

    docs = payload["items"][1]
    deleted = await client.delete(
        f"/api/v1/me/quick-links/{docs['id']}?expected_version={docs['version']}"
    )
    assert deleted.status_code == 204
    listed = await client.get("/api/v1/me/quick-links")
    assert listed.status_code == 200
    assert listed.json()["total"] == 1


async def test_workspace_quick_links_reject_unsafe_destinations_and_invalid_updates(client):
    for destination in (
        "http://example.com",
        "javascript:alert(1)",
        "data:text/html,hello",
        "//example.com/path",
        "https://user:secret@example.com/private",
        "/projects\\evil",
    ):
        response = await client.post(
            "/api/v1/me/quick-links",
            json={"title": "unsafe", "destination": destination},
        )
        assert response.status_code == 422, (destination, response.text)

    assert (
        await client.post("/api/v1/me/quick-links", json={"title": " ", "destination": "/projects"})
    ).status_code == 422
    link = await _create(client, "valid", "/projects")
    for body in (
        {"expected_version": link["version"]},
        {"expected_version": link["version"], "title": None},
        {"expected_version": link["version"], "destination": None},
    ):
        response = await client.patch(f"/api/v1/me/quick-links/{link['id']}", json=body)
        assert response.status_code == 422, response.text


async def test_workspace_quick_links_conflict_owner_isolation_and_exact_order(client, app):
    first = await _create(client, "first", "/my")
    second = await _create(client, "second", "/inbox")
    changed = await client.patch(
        f"/api/v1/me/quick-links/{first['id']}",
        json={"expected_version": 0, "title": "changed"},
    )
    assert changed.status_code == 200
    stale = await client.delete(f"/api/v1/me/quick-links/{first['id']}?expected_version=0")
    assert stale.status_code == 409
    assert stale.json()["current"]["version"] == 1

    for items in (
        [{"id": second["id"], "expected_version": 0}],
        [
            {"id": second["id"], "expected_version": 0},
            {"id": second["id"], "expected_version": 0},
        ],
    ):
        response = await client.put("/api/v1/me/quick-links/order", json={"items": items})
        assert response.status_code == 422

    foreign_id = uuid.uuid4()
    async with app.state.sessionmaker() as session, session.begin():
        other = User(email="links-other@oneflow.local", display_name="Links Other")
        session.add(other)
        await session.flush()
        session.add(
            WorkspaceQuickLink(
                id=foreign_id,
                user_id=other.id,
                title="hidden",
                destination="https://hidden.example.com/",
            )
        )
    assert (
        await client.patch(
            f"/api/v1/me/quick-links/{foreign_id}",
            json={"expected_version": 0, "title": "no"},
        )
    ).status_code == 404
    assert (await client.get("/api/v1/me/quick-links")).json()["total"] == 2


async def test_workspace_quick_links_concurrent_create_respects_cap(app, client, dev_user):
    async with app.state.sessionmaker() as session, session.begin():
        session.add_all(
            [
                WorkspaceQuickLink(
                    user_id=dev_user.id,
                    title=f"seed {index}",
                    destination=f"/projects?seed={index}",
                    position=index,
                )
                for index in range(7)
            ]
        )

    first, second = await asyncio.gather(
        client.post("/api/v1/me/quick-links", json={"title": "cap first", "destination": "/my"}),
        client.post(
            "/api/v1/me/quick-links", json={"title": "cap second", "destination": "/inbox"}
        ),
    )
    assert sorted([first.status_code, second.status_code]) == [201, 409]
    assert (await client.get("/api/v1/me/quick-links")).json()["total"] == 8


async def test_workspace_quick_links_openapi_documents_business_errors(app):
    paths = app.openapi()["paths"]
    assert set(paths["/api/v1/me/quick-links"]["post"]["responses"]) >= {
        "201",
        "409",
        "503",
    }
    for method, path in (
        ("patch", "/api/v1/me/quick-links/{link_id}"),
        ("put", "/api/v1/me/quick-links/order"),
        ("delete", "/api/v1/me/quick-links/{link_id}"),
    ):
        assert "503" in paths[path][method]["responses"]
