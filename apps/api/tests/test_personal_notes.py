import asyncio
import uuid

from app.models import PersonalNote, User


async def _create(client, title: str, **extra):
    response = await client.post("/api/v1/me/personal-notes", json={"title": title, **extra})
    assert response.status_code == 201, response.text
    return response.json()


async def test_personal_notes_crud_search_pin_and_order(client):
    alpha = await _create(client, "alpha plan", body="plain text")
    beta = await _create(client, "beta", is_pinned=True)
    listed = await client.get("/api/v1/me/personal-notes?q=alpha&limit=1&offset=0")
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["limit"] == 1
    assert listed.json()["offset"] == 0
    assert listed.json()["items"][0]["id"] == alpha["id"]

    patched = await client.patch(
        f"/api/v1/me/personal-notes/{alpha['id']}",
        json={"expected_version": alpha["version"], "is_pinned": True, "title": "alpha revised"},
    )
    assert patched.status_code == 200, patched.text
    alpha = patched.json()
    assert alpha["is_pinned"] is True and alpha["version"] == 1

    # The order contract is full-set and pinned-first; it normalizes positions.
    ordered = await client.put(
        "/api/v1/me/personal-notes/order",
        json={
            "items": [
                {"id": beta["id"], "expected_version": beta["version"]},
                {"id": alpha["id"], "expected_version": alpha["version"]},
            ]
        },
    )
    assert ordered.status_code == 200, ordered.text
    assert [item["position"] for item in ordered.json()["items"]] == [0, 1]

    alpha = next(item for item in ordered.json()["items"] if item["id"] == alpha["id"])
    deleted = await client.delete(
        f"/api/v1/me/personal-notes/{alpha['id']}?expected_version={alpha['version']}"
    )
    assert deleted.status_code == 204


async def test_personal_notes_validation_conflict_and_owner_isolation(client, app):
    note = await _create(client, "mine")
    stale = await client.patch(
        f"/api/v1/me/personal-notes/{note['id']}",
        json={"expected_version": note["version"], "body": "new"},
    )
    assert stale.status_code == 200
    conflict = await client.delete(
        f"/api/v1/me/personal-notes/{note['id']}?expected_version={note['version']}"
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "note was changed elsewhere"
    assert conflict.json()["current"]["version"] == 1
    assert (await client.post("/api/v1/me/personal-notes", json={"title": " "})).status_code == 422
    too_long = await client.post(
        "/api/v1/me/personal-notes", json={"title": "x", "body": "a" * 4001}
    )
    assert too_long.status_code == 422

    foreign_id = uuid.uuid4()
    async with app.state.sessionmaker() as session, session.begin():
        other = User(email="notes-other@oneflow.local", display_name="Notes Other")
        session.add(other)
        await session.flush()
        session.add(PersonalNote(id=foreign_id, user_id=other.id, title="hidden"))
    assert (
        await client.patch(
            f"/api/v1/me/personal-notes/{foreign_id}", json={"expected_version": 0, "title": "no"}
        )
    ).status_code == 404
    assert (await client.get("/api/v1/me/personal-notes")).json()["total"] == 1

    for field in ("title", "body", "is_pinned"):
        invalid = await client.patch(
            f"/api/v1/me/personal-notes/{note['id']}",
            json={"expected_version": 1, field: None},
        )
        assert invalid.status_code == 422, (field, invalid.text)
    empty = await client.patch(
        f"/api/v1/me/personal-notes/{note['id']}", json={"expected_version": 1}
    )
    assert empty.status_code == 422
    out_of_range = await client.patch(
        f"/api/v1/me/personal-notes/{note['id']}",
        json={"expected_version": 2_147_483_648, "body": "no"},
    )
    assert out_of_range.status_code == 422


async def test_personal_note_order_rejects_partial_duplicate_and_cross_pin(client):
    first = await _create(client, "first", is_pinned=True)
    second = await _create(client, "second")
    for items in (
        [{"id": first["id"], "expected_version": 0}],
        [{"id": first["id"], "expected_version": 0}, {"id": first["id"], "expected_version": 0}],
        [{"id": second["id"], "expected_version": 0}, {"id": first["id"], "expected_version": 0}],
    ):
        response = await client.put("/api/v1/me/personal-notes/order", json={"items": items})
        assert response.status_code == 422

    oversized = await client.put(
        "/api/v1/me/personal-notes/order",
        json={"items": [{"id": str(uuid.uuid4()), "expected_version": 0} for _ in range(201)]},
    )
    assert oversized.status_code == 422


async def test_personal_note_openapi_documents_business_and_busy_errors(app):
    paths = app.openapi()["paths"]
    assert set(paths["/api/v1/me/personal-notes"]["post"]["responses"]) >= {
        "201",
        "409",
        "503",
    }
    for method, path in (
        ("patch", "/api/v1/me/personal-notes/{note_id}"),
        ("put", "/api/v1/me/personal-notes/order"),
        ("delete", "/api/v1/me/personal-notes/{note_id}"),
    ):
        assert "503" in paths[path][method]["responses"]


async def test_personal_note_concurrent_patch_has_single_winner(client):
    note = await _create(client, "race")
    first, second = await asyncio.gather(
        client.patch(
            f"/api/v1/me/personal-notes/{note['id']}",
            json={"expected_version": 0, "body": "first"},
        ),
        client.patch(
            f"/api/v1/me/personal-notes/{note['id']}",
            json={"expected_version": 0, "body": "second"},
        ),
    )
    assert sorted([first.status_code, second.status_code]) == [200, 409]
    winner, loser = (first, second) if first.status_code == 200 else (second, first)
    assert loser.json()["current"]["version"] == 1
    assert loser.json()["current"]["body"] == winner.json()["body"]


async def test_personal_note_concurrent_create_respects_user_cap(app, client, dev_user):
    async with app.state.sessionmaker() as session, session.begin():
        session.add_all(
            [
                PersonalNote(user_id=dev_user.id, title=f"seed {index}", position=index)
                for index in range(199)
            ]
        )

    first, second = await asyncio.gather(
        client.post("/api/v1/me/personal-notes", json={"title": "cap first"}),
        client.post("/api/v1/me/personal-notes", json={"title": "cap second"}),
    )
    assert sorted([first.status_code, second.status_code]) == [201, 409]
    listed = await client.get("/api/v1/me/personal-notes?limit=200")
    assert listed.status_code == 200
    assert listed.json()["total"] == 200
    assert len(listed.json()["items"]) == 200
