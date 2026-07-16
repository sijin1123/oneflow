"""Document comments (expansion PLAN Pass 43 PR-BI).

Contract (v43.1): flat plain-text margin notes; composite same-project FK
(cross-project unrepresentable, CASCADE with the document); limit/offset +
FULL total (nothing unreachable); delete = author OR project owner (admin
never bypasses project scopes); archive write-gate 409/read open; author
display is the web's three-state policy."""

import uuid

import pytest
from sqlalchemy import func, select, text

from app.models.document import ProjectDocument
from app.models.document_comment import ProjectDocumentComment
from tests.conftest import create_project


@pytest.fixture
async def doc(client):
    project = await create_project(client, key="DCMT", name="문서 코멘트")
    res = await client.post(
        f"/api/v1/projects/{project['id']}/documents",
        json={"title": "가이드", "body": "<p>본문</p>"},
    )
    assert res.status_code == 201
    return {"pid": project["id"], "doc": res.json()}


async def comment(client, doc_id, body="첫 코멘트"):
    return await client.post(f"/api/v1/documents/{doc_id}/comments", json={"body": body})


async def test_crud_normalization_and_pagination(client, doc):
    doc_id = doc["doc"]["id"]
    me = (await client.get("/api/v1/me")).json()

    created = await comment(client, doc_id, "  여백 메모  ")
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["body"] == "여백 메모"  # trimmed
    assert body["author_id"] == me["id"]

    # Plain text stored as-is — the web renders text nodes; a <script> input
    # is just characters (v43.1 R1-⑤).
    scripted = await comment(client, doc_id, "<script>alert(1)</script>")
    assert scripted.json()["body"] == "<script>alert(1)</script>"

    # Boundaries: 4000 ok, 4001/whitespace-only 422.
    assert (await comment(client, doc_id, "x" * 4000)).status_code == 201
    assert (await comment(client, doc_id, "x" * 4001)).status_code == 422
    assert (await comment(client, doc_id, "   ")).status_code == 422

    # limit/offset with FULL total — nothing unreachable (R1-②).
    listed = (await client.get(f"/api/v1/documents/{doc_id}/comments?limit=2")).json()
    assert (len(listed["items"]), listed["total"]) == (2, 3)
    page2 = (await client.get(f"/api/v1/documents/{doc_id}/comments?limit=2&offset=2")).json()
    assert (len(page2["items"]), page2["total"]) == (1, 3)

    # Author delete → 204; second delete → 404 (rowcount 0).
    cid = body["id"]
    assert (await client.delete(f"/api/v1/document-comments/{cid}")).status_code == 204
    assert (await client.delete(f"/api/v1/document-comments/{cid}")).status_code == 404


async def test_owner_cleanup_and_authorship_guard(client, app, doc, member_project):
    """The project owner can clean up ANY comment (incl. author-less rows);
    a plain member deleting someone else's comment sees 404 (hidden)."""
    doc_id = doc["doc"]["id"]
    c = (await comment(client, doc_id, "지울 대상")).json()

    # Simulate an author-less row (user deleted → SET NULL).
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text(
                "UPDATE project_document_comments SET author_id = NULL WHERE id = CAST(:id AS uuid)"
            ).bindparams(id=c["id"])
        )
    # The dev user OWNS this project — owner cleanup works on author-less rows.
    assert (await client.delete(f"/api/v1/document-comments/{c['id']}")).status_code == 204

    # In a project where the dev user is a plain MEMBER, someone else's
    # comment (the owner's) is delete-hidden.
    shared_pid = str(member_project["project_id"])
    shared_doc = (
        await client.post(
            f"/api/v1/projects/{shared_pid}/documents", json={"title": "공유 문서", "body": None}
        )
    ).json()
    foreign_comment = (await comment(client, shared_doc["id"], "멤버의 코멘트")).json()
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text(
                "UPDATE project_document_comments SET author_id = CAST(:owner AS uuid) "
                "WHERE id = CAST(:id AS uuid)"
            ).bindparams(owner=str(member_project["owner_id"]), id=foreign_comment["id"])
        )
    assert (
        await client.delete(f"/api/v1/document-comments/{foreign_comment['id']}")
    ).status_code == 404


async def test_scope_archive_and_cascade(client, app, doc, foreign_project):
    doc_id = doc["doc"]["id"]
    pid = doc["pid"]
    await comment(client, doc_id, "보존 확인")

    # Foreign project's document: existence hidden both ways.
    from app.models.document import ProjectDocument

    async with app.state.sessionmaker() as session, session.begin():
        foreign_doc = ProjectDocument(project_id=foreign_project["project_id"], title="남의 문서")
        session.add(foreign_doc)
        await session.flush()
        foreign_id = foreign_doc.id
    assert (await client.get(f"/api/v1/documents/{foreign_id}/comments")).status_code == 404
    assert (await comment(client, foreign_id, "누출 시도")).status_code == 404
    foreign_anchor = uuid.uuid4()
    assert (
        await client.post(
            f"/api/v1/documents/{foreign_id}/inline-comments",
            json={
                "body": "누출 시도",
                "anchor_id": str(foreign_anchor),
                "anchor_quote": "남의",
                "expected_document_version": 0,
                "document_body": (
                    f'<p><span data-comment-anchor="{foreign_anchor}">남의</span></p>'
                ),
            },
        )
    ).status_code == 404

    # Archive: write 409, read open.
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (await comment(client, doc_id, "차단됨")).status_code == 409
    archived_anchor = uuid.uuid4()
    assert (
        await client.post(
            f"/api/v1/documents/{doc_id}/inline-comments",
            json={
                "body": "차단됨",
                "anchor_id": str(archived_anchor),
                "anchor_quote": "본문",
                "expected_document_version": 0,
                "document_body": (
                    f'<p><span data-comment-anchor="{archived_anchor}">본문</span></p>'
                ),
            },
        )
    ).status_code == 409
    assert (await client.get(f"/api/v1/documents/{doc_id}/comments")).status_code == 200
    await client.post(f"/api/v1/projects/{pid}/unarchive")

    # Comments die with their document (composite FK CASCADE).
    assert (await client.delete(f"/api/v1/documents/{doc_id}")).status_code == 204
    async with app.state.sessionmaker() as session:
        remaining = (
            await session.execute(text("SELECT count(*) FROM project_document_comments"))
        ).scalar_one()
    assert remaining == 0


async def test_inline_anchor_atomic_create_reply_and_stale_rollback(client, app, doc):
    doc_id = doc["doc"]["id"]
    anchor_id = uuid.uuid4()
    anchored_body = (
        f'<p><span data-comment-anchor="{anchor_id}" onclick="alert(1)">'
        "<strong>본문</strong><br>계속</span></p>"
    )

    created = await client.post(
        f"/api/v1/documents/{doc_id}/inline-comments",
        json={
            "body": "첫 인라인 메모",
            "anchor_id": str(anchor_id),
            "anchor_quote": "본문 계속",
            "expected_document_version": 0,
            "document_body": anchored_body,
        },
    )
    assert created.status_code == 201, created.text
    payload = created.json()
    assert payload["comment"]["anchor_id"] == str(anchor_id)
    assert payload["comment"]["anchor_quote"] == "본문 계속"
    assert payload["document"]["version"] == 1
    assert f'data-comment-anchor="{anchor_id}"' in payload["document"]["body"]
    assert "onclick" not in payload["document"]["body"]

    # A reply validates the existing marker but leaves the document/version
    # untouched because the submitted sanitized body is identical.
    reply = await client.post(
        f"/api/v1/documents/{doc_id}/inline-comments",
        json={
            "body": "답글",
            "anchor_id": str(anchor_id),
            "anchor_quote": "본문 계속",
        },
    )
    assert reply.status_code == 201, reply.text
    assert reply.json()["document"]["version"] == 1

    before_count = None
    before_body = None
    async with app.state.sessionmaker() as session:
        before_count = await session.scalar(
            select(func.count())
            .select_from(ProjectDocumentComment)
            .where(ProjectDocumentComment.document_id == uuid.UUID(doc_id))
        )
        before_body = await session.scalar(
            select(ProjectDocument.body).where(ProjectDocument.id == uuid.UUID(doc_id))
        )

    stale_anchor = uuid.uuid4()
    stale = await client.post(
        f"/api/v1/documents/{doc_id}/inline-comments",
        json={
            "body": "저장되면 안 됨",
            "anchor_id": str(stale_anchor),
            "anchor_quote": "본문",
            "expected_document_version": 0,
            "document_body": (f'<p><span data-comment-anchor="{stale_anchor}">본문</span></p>'),
        },
    )
    assert stale.status_code == 409
    assert stale.json()["current"]["version"] == 1

    async with app.state.sessionmaker() as session:
        assert (
            await session.scalar(
                select(func.count())
                .select_from(ProjectDocumentComment)
                .where(ProjectDocumentComment.document_id == uuid.UUID(doc_id))
            )
            == before_count
        )
        assert (
            await session.scalar(
                select(ProjectDocument.body).where(ProjectDocument.id == uuid.UUID(doc_id))
            )
            == before_body
        )


async def test_inline_anchor_rejects_missing_mismatched_or_reused_quote(client, doc):
    doc_id = doc["doc"]["id"]
    anchor_id = uuid.uuid4()

    missing = await client.post(
        f"/api/v1/documents/{doc_id}/inline-comments",
        json={
            "body": "메모",
            "anchor_id": str(anchor_id),
            "anchor_quote": "본문",
            "expected_document_version": 0,
            "document_body": "<p>본문</p>",
        },
    )
    assert missing.status_code == 422

    mismatched = await client.post(
        f"/api/v1/documents/{doc_id}/inline-comments",
        json={
            "body": "메모",
            "anchor_id": str(anchor_id),
            "anchor_quote": "다른 문구",
            "expected_document_version": 0,
            "document_body": (f'<p><span data-comment-anchor="{anchor_id}">본문</span></p>'),
        },
    )
    assert mismatched.status_code == 422

    first = await client.post(
        f"/api/v1/documents/{doc_id}/inline-comments",
        json={
            "body": "첫 메모",
            "anchor_id": str(anchor_id),
            "anchor_quote": "본문",
            "expected_document_version": 0,
            "document_body": (f'<p><span data-comment-anchor="{anchor_id}">본문</span></p>'),
        },
    )
    assert first.status_code == 201

    reused = await client.post(
        f"/api/v1/documents/{doc_id}/inline-comments",
        json={
            "body": "위조 답글",
            "anchor_id": str(anchor_id),
            "anchor_quote": "본문 변조",
            "expected_document_version": 1,
            "document_body": (f'<p><span data-comment-anchor="{anchor_id}">본문 변조</span></p>'),
        },
    )
    assert reused.status_code == 422
