"""Nested document/page hierarchy (expansion PLAN Pass 9 PR-U).

Contract (v9.1): parent changes ride the PATCH optimistic-concurrency contract;
self/cycle/depth violations are 422 (root=depth 1, a path holds at most 10
documents); a cross-project parent is unrepresentable at the DB level; deleting
a parent promotes children to root (no silent subtree deletion)."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models.document import MAX_DOCUMENT_DEPTH
from tests.conftest import create_project


async def create_doc(client, pid, title, parent_id=None):
    body = {"title": title}
    if parent_id is not None:
        body["parent_id"] = parent_id
    res = await client.post(f"/api/v1/projects/{pid}/documents", json=body)
    return res


async def reparent(client, doc, parent_id, expected_version=None):
    return await client.patch(
        f"/api/v1/documents/{doc['id']}",
        json={
            "expected_version": doc["version"] if expected_version is None else expected_version,
            "parent_id": parent_id,
        },
    )


@pytest.fixture
async def project(client):
    return await create_project(client, key="WIKI", name="위키 프로젝트")


async def test_hierarchy_roundtrip_and_list_exposes_parent(client, project):
    pid = project["id"]
    root = (await create_doc(client, pid, "가이드")).json()
    child = (await create_doc(client, pid, "설치", parent_id=root["id"])).json()
    assert child["parent_id"] == root["id"]

    listed = (await client.get(f"/api/v1/projects/{pid}/documents")).json()
    by_title = {d["title"]: d for d in listed["items"]}
    assert by_title["설치"]["parent_id"] == root["id"]
    assert by_title["가이드"]["parent_id"] is None

    # Reparent to root via explicit null; version bumps (§6.2 contract).
    res = await reparent(client, child, None)
    assert res.status_code == 200, res.text
    assert res.json()["parent_id"] is None
    assert res.json()["version"] == child["version"] + 1


async def test_self_cycle_and_missing_parent_422(client, project):
    pid = project["id"]
    a = (await create_doc(client, pid, "A")).json()
    b = (await create_doc(client, pid, "B", parent_id=a["id"])).json()

    assert (await reparent(client, a, a["id"])).status_code == 422
    # A under B would close the loop A→B→A.
    res = await reparent(client, a, b["id"])
    assert res.status_code == 422
    assert "cycle" in res.json()["detail"]
    # Nonexistent parent (and, by the same guard, a foreign one) is a clean 422.
    assert (await reparent(client, a, "00000000-0000-0000-0000-000000000000")).status_code == 422
    assert (
        await create_doc(client, pid, "고아", parent_id="00000000-0000-0000-0000-000000000000")
    ).status_code == 422


async def test_depth_cap_on_create_and_move(client, project):
    pid = project["id"]
    docs = []
    parent_id = None
    for i in range(MAX_DOCUMENT_DEPTH):  # builds a full-depth chain (root=1 … 10)
        doc = (await create_doc(client, pid, f"레벨 {i + 1}", parent_id=parent_id)).json()
        docs.append(doc)
        parent_id = doc["id"]

    # The 11th level is rejected on create…
    res = await create_doc(client, pid, "초과", parent_id=docs[-1]["id"])
    assert res.status_code == 422
    assert str(MAX_DOCUMENT_DEPTH) in res.json()["detail"]

    # …and on move: hanging a 2-doc subtree under depth 9 exceeds the cap.
    sub_root = (await create_doc(client, pid, "서브 루트")).json()
    await create_doc(client, pid, "서브 자식", parent_id=sub_root["id"])
    assert (await reparent(client, sub_root, docs[-2]["id"])).status_code == 422
    # …but the same subtree fits under depth 8.
    assert (await reparent(client, sub_root, docs[-3]["id"])).status_code == 200


async def test_cross_project_parent_unrepresentable_in_db(client, app, project):
    other = await create_project(client, key="WIKI2", name="다른 위키")
    mine = (await create_doc(client, project["id"], "내 문서")).json()
    theirs = (await create_doc(client, other["id"], "남의 문서")).json()

    # API rejects it as a plain 422 (same-project guard)…
    assert (await reparent(client, mine, theirs["id"])).status_code == 422
    # …and the composite FK blocks API-bypassing writes outright.
    with pytest.raises(IntegrityError):
        async with app.state.sessionmaker() as session, session.begin():
            await session.execute(
                text(
                    "UPDATE project_documents SET parent_id = CAST(:parent AS uuid) "
                    "WHERE id = CAST(:id AS uuid)"
                ).bindparams(parent=theirs["id"], id=mine["id"])
            )


async def test_parent_delete_promotes_children_to_root(client, project):
    pid = project["id"]
    root = (await create_doc(client, pid, "부모")).json()
    child = (await create_doc(client, pid, "자식", parent_id=root["id"])).json()

    assert (await client.delete(f"/api/v1/documents/{root['id']}")).status_code == 204
    res = await client.get(f"/api/v1/documents/{child['id']}")
    assert res.status_code == 200
    assert res.json()["parent_id"] is None  # promoted, not deleted


async def test_stale_reparent_conflicts_and_guards(client, project, foreign_project):
    pid = project["id"]
    root = (await create_doc(client, pid, "루트")).json()
    doc = (await create_doc(client, pid, "이동 대상")).json()

    # Stale version: guards pass but the conditional UPDATE misses → 409.
    res = await reparent(client, doc, root["id"], expected_version=doc["version"] + 5)
    assert res.status_code == 409

    # Non-member sees 404 (existence hiding) even for a valid-looking reparent.
    foreign_doc_res = await client.get(f"/api/v1/projects/{foreign_project['project_id']}")
    assert foreign_doc_res.status_code == 404

    # Archived project: parent change is a write → 409.
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (await reparent(client, doc, root["id"])).status_code == 409
    await client.post(f"/api/v1/projects/{pid}/unarchive")
