"""Attachment anchors (expansion PLAN Pass 23 PR-AO).

Contract (v23.1): strict on write (missing/cross-project/double anchor 422,
validated BEFORE any row/blob), lenient on read (double filter 422 only —
unknown ids match nothing); deleting the anchor SET-NULLs it and PRESERVES the
file as a plain project attachment."""

from sqlalchemy import text

from tests.conftest import create_project, create_wp


async def create_url_attachment(client, pid, **extra):
    body = {"filename": "spec.pdf", "url": "https://example.com/spec.pdf", **extra}
    return await client.post(f"/api/v1/projects/{pid}/attachments", json=body)


async def test_anchor_write_contract(client, foreign_project):
    project = await create_project(client, key="ANCH", name="앵커 프로젝트")
    pid = project["id"]
    wp = await create_wp(client, pid, subject="앵커 작업")
    doc = (
        await client.post(f"/api/v1/projects/{pid}/documents", json={"title": "앵커 문서"})
    ).json()

    res = await create_url_attachment(client, pid, work_package_id=wp["id"])
    assert res.status_code == 201, res.text
    assert res.json()["work_package_id"] == wp["id"]
    res = await create_url_attachment(client, pid, document_id=doc["id"])
    assert res.status_code == 201
    assert res.json()["document_id"] == doc["id"]

    # Strict write: double anchor / missing / cross-project → 422.
    assert (
        await create_url_attachment(client, pid, work_package_id=wp["id"], document_id=doc["id"])
    ).status_code == 422
    ghost = "00000000-0000-0000-0000-000000000000"
    assert (await create_url_attachment(client, pid, work_package_id=ghost)).status_code == 422
    foreign_wp = str(foreign_project["wp_id"])
    assert (await create_url_attachment(client, pid, work_package_id=foreign_wp)).status_code == 422


async def test_read_filters_lenient_and_promotion(client, app):
    project = await create_project(client, key="ANCH2", name="승격 프로젝트")
    pid = project["id"]
    wp = await create_wp(client, pid, subject="삭제될 앵커")
    att = (await create_url_attachment(client, pid, work_package_id=wp["id"])).json()
    await create_url_attachment(client, pid)  # unanchored

    listed = (
        await client.get(f"/api/v1/projects/{pid}/attachments?work_package_id={wp['id']}")
    ).json()
    assert [a["id"] for a in listed["items"]] == [att["id"]]

    # Lenient read: unknown filter id → empty list; double filter → 422.
    ghost = "00000000-0000-0000-0000-000000000000"
    empty = (await client.get(f"/api/v1/projects/{pid}/attachments?work_package_id={ghost}")).json()
    assert empty["total"] == 0
    res = await client.get(
        f"/api/v1/projects/{pid}/attachments?work_package_id={ghost}&document_id={ghost}"
    )
    assert res.status_code == 422

    # Anchor delete → SET NULL promotion: the FILE survives as a project file.
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text("DELETE FROM work_packages WHERE id = CAST(:id AS uuid)").bindparams(id=wp["id"])
        )
    listed = (await client.get(f"/api/v1/projects/{pid}/attachments")).json()
    row = next(a for a in listed["items"] if a["id"] == att["id"])
    assert row["work_package_id"] is None  # promoted, not deleted


async def test_upload_with_anchor_and_db_backstop(client, app):
    project = await create_project(client, key="ANCH3", name="업로드 앵커")
    pid = project["id"]
    wp = await create_wp(client, pid, subject="업로드 대상")

    res = await client.post(
        f"/api/v1/projects/{pid}/attachments/upload?filename=a.txt&work_package_id={wp['id']}",
        content=b"hello",
        headers={"content-type": "text/plain", "content-length": "5"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["work_package_id"] == wp["id"]

    # DB CHECK: both anchors set via raw SQL is unrepresentable.
    import pytest
    from sqlalchemy.exc import IntegrityError

    doc = (
        await client.post(f"/api/v1/projects/{pid}/documents", json={"title": "체크 문서"})
    ).json()
    with pytest.raises(IntegrityError):
        async with app.state.sessionmaker() as session, session.begin():
            await session.execute(
                text(
                    "UPDATE attachments SET document_id = CAST(:doc AS uuid) "
                    "WHERE work_package_id = CAST(:wp AS uuid)"
                ).bindparams(doc=doc["id"], wp=wp["id"])
            )
