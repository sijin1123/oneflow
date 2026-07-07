"""Page ↔ work-package links (expansion PLAN Pass 9 PR-V).

Contract (v9.1): links are association facts (CASCADE both sides); duplicates
409; a WP outside the document's project is 404 (existence hiding, R1-④); the
DELETE is fully scoped to (id, document_id, project_id) so a foreign link id is
404, never a cross-scope delete (R1-①)."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.conftest import create_project, create_wp


async def create_doc(client, pid, title):
    res = await client.post(f"/api/v1/projects/{pid}/documents", json={"title": title})
    return res.json()


async def link(client, doc_id, wp_id):
    return await client.post(
        f"/api/v1/documents/{doc_id}/work-package-links", json={"work_package_id": wp_id}
    )


@pytest.fixture
async def project(client):
    return await create_project(client, key="LINK", name="링크 프로젝트")


async def test_link_roundtrip_and_reverse_lookup(client, project):
    pid = project["id"]
    doc = await create_doc(client, pid, "설계 문서")
    wp = await create_wp(client, pid, subject="구현 작업")

    res = await link(client, doc["id"], wp["id"])
    assert res.status_code == 201, res.text
    created = res.json()
    assert created["document_id"] == doc["id"]
    assert created["work_package_id"] == wp["id"]

    listed = (await client.get(f"/api/v1/documents/{doc['id']}/work-package-links")).json()
    assert listed["total"] == 1

    # Reverse lookup for the drawer: WP → documents.
    docs = (await client.get(f"/api/v1/work-packages/{wp['id']}/documents")).json()
    assert [d["title"] for d in docs["items"]] == ["설계 문서"]

    # Duplicate is a clean 409.
    assert (await link(client, doc["id"], wp["id"])).status_code == 409

    # Scoped delete.
    res = await client.delete(f"/api/v1/documents/{doc['id']}/work-package-links/{created['id']}")
    assert res.status_code == 204
    assert (await client.get(f"/api/v1/documents/{doc['id']}/work-package-links")).json()[
        "total"
    ] == 0


async def test_delete_is_scoped_to_document(client, project):
    pid = project["id"]
    doc_a = await create_doc(client, pid, "문서 A")
    doc_b = await create_doc(client, pid, "문서 B")
    wp = await create_wp(client, pid, subject="공유 작업")
    created = (await link(client, doc_a["id"], wp["id"])).json()

    # The right link id under the WRONG document is 404 — nothing is deleted.
    res = await client.delete(f"/api/v1/documents/{doc_b['id']}/work-package-links/{created['id']}")
    assert res.status_code == 404
    assert (await client.get(f"/api/v1/documents/{doc_a['id']}/work-package-links")).json()[
        "total"
    ] == 1


async def test_cross_project_wp_is_404_and_db_blocked(client, app, project):
    pid = project["id"]
    other = await create_project(client, key="LINK2", name="다른 프로젝트")
    doc = await create_doc(client, pid, "내 문서")
    foreign_wp = await create_wp(client, other["id"], subject="남의 작업")

    # API: existence hiding (the WP is not in this document's project).
    assert (await link(client, doc["id"], foreign_wp["id"])).status_code == 404

    # DB: the composite FK rejects an API-bypassing cross-project row.
    with pytest.raises(IntegrityError):
        async with app.state.sessionmaker() as session, session.begin():
            await session.execute(
                text(
                    "INSERT INTO document_work_package_links "
                    "(id, project_id, document_id, work_package_id) "
                    "VALUES (gen_random_uuid(), CAST(:pid AS uuid), CAST(:doc AS uuid), "
                    "CAST(:wp AS uuid))"
                ).bindparams(pid=pid, doc=doc["id"], wp=foreign_wp["id"])
            )


async def test_links_cascade_on_either_side_delete(client, app, project):
    pid = project["id"]
    wp = await create_wp(client, pid, subject="작업")
    doc_del = await create_doc(client, pid, "삭제될 문서")
    doc_keep = await create_doc(client, pid, "남는 문서")
    await link(client, doc_del["id"], wp["id"])
    await link(client, doc_keep["id"], wp["id"])

    # Document delete removes its link only.
    assert (await client.delete(f"/api/v1/documents/{doc_del['id']}")).status_code == 204
    docs = (await client.get(f"/api/v1/work-packages/{wp['id']}/documents")).json()
    assert [d["title"] for d in docs["items"]] == ["남는 문서"]

    # WP-side cascade: there is no WP delete API, so exercise the FK directly.
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text("DELETE FROM work_packages WHERE id = CAST(:id AS uuid)").bindparams(id=wp["id"])
        )
    listed = (await client.get(f"/api/v1/documents/{doc_keep['id']}/work-package-links")).json()
    assert listed["total"] == 0


async def test_membership_and_archive_guards(client, project, foreign_project):
    pid = project["id"]
    doc = await create_doc(client, pid, "가드 문서")
    wp = await create_wp(client, pid, subject="가드 작업")

    # Non-member: the foreign project's resources read as 404 for us.
    foreign_pid = str(foreign_project["project_id"])
    res = await client.get(f"/api/v1/projects/{foreign_pid}/documents")
    assert res.status_code == 404

    # Archived project: link create/delete are writes → 409; reads stay open.
    created = (await link(client, doc["id"], wp["id"])).json()
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (await link(client, doc["id"], wp["id"])).status_code == 409
    assert (
        await client.delete(f"/api/v1/documents/{doc['id']}/work-package-links/{created['id']}")
    ).status_code == 409
    assert (
        await client.get(f"/api/v1/documents/{doc['id']}/work-package-links")
    ).status_code == 200
    await client.post(f"/api/v1/projects/{pid}/unarchive")
