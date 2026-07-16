"""Document comment free-emoji reactions (UI-124).

Both legacy page comments and inline threads share one Document-owned reaction
contract. Aggregates are member-scoped, writes use the normal document writer
gate, and reactions cascade with the comment/user.
"""

import asyncio
import uuid

import pytest
from sqlalchemy import select, text

from app.models.document import ProjectDocument
from app.models.document_comment import (
    ProjectDocumentComment,
    ProjectDocumentCommentReaction,
)
from app.models.user import User
from tests.conftest import create_project


@pytest.fixture
async def reaction_doc(client):
    project = await create_project(client, key="DREA", name="문서 리액션")
    response = await client.post(
        f"/api/v1/projects/{project['id']}/documents",
        json={"title": "검토 문서", "body": "<p>본문 문구</p>"},
    )
    assert response.status_code == 201
    return {"project_id": project["id"], "document": response.json()}


async def create_comment(client, document_id, body="검토 의견"):
    response = await client.post(
        f"/api/v1/documents/{document_id}/comments",
        json={"body": body},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def react(client, comment_id, emoji="👍"):
    return await client.put(f"/api/v1/document-comments/{comment_id}/reactions/{emoji}")


async def unreact(client, comment_id, emoji="👍"):
    return await client.delete(f"/api/v1/document-comments/{comment_id}/reactions/{emoji}")


async def test_general_and_inline_reactions_toggle_and_aggregate(client, app, reaction_doc):
    document = reaction_doc["document"]
    general = await create_comment(client, document["id"])
    assert general["reactions"] == []

    anchor_id = uuid.uuid4()
    inline_response = await client.post(
        f"/api/v1/documents/{document['id']}/inline-comments",
        json={
            "body": "본문 답글",
            "anchor_id": str(anchor_id),
            "anchor_quote": "본문",
            "expected_document_version": 0,
            "document_body": (f'<p><span data-comment-anchor="{anchor_id}">본문</span> 문구</p>'),
        },
    )
    assert inline_response.status_code == 201, inline_response.text
    inline = inline_response.json()["comment"]

    first = await react(client, general["id"], "✨")
    assert first.status_code == 200
    assert first.json()["items"] == [{"key": "✨", "count": 1, "me": True}]
    duplicate = await react(client, general["id"], "✨")
    assert duplicate.json()["items"] == [{"key": "✨", "count": 1, "me": True}]

    legacy = await react(client, general["id"], "thumbs_up")
    assert any(item["key"] == "👍" for item in legacy.json()["items"])
    assert (await react(client, inline["id"], "🎉")).status_code == 200

    # A second user's historical reaction proves deterministic count-desc
    # aggregation without weakening the current caller's `me` bit.
    async with app.state.sessionmaker() as session, session.begin():
        other = User(email="reactor@oneflow.local", display_name="Reactor")
        session.add(other)
        await session.flush()
        session.add(
            ProjectDocumentCommentReaction(
                comment_id=uuid.UUID(general["id"]),
                user_id=other.id,
                emoji="✨",
            )
        )

    listed = (await client.get(f"/api/v1/documents/{document['id']}/comments")).json()["items"]
    general_listed = next(item for item in listed if item["id"] == general["id"])
    assert general_listed["reactions"][0] == {"key": "✨", "count": 2, "me": True}
    inline_listed = next(item for item in listed if item["id"] == inline["id"])
    assert inline_listed["reactions"] == [{"key": "🎉", "count": 1, "me": True}]

    removed = await unreact(client, general["id"], "✨")
    assert removed.status_code == 200
    assert removed.json()["items"] == [
        {"key": "✨", "count": 1, "me": False},
        {"key": "👍", "count": 1, "me": True},
    ]
    assert (await unreact(client, general["id"], "✨")).status_code == 200

    for bad in ("sparkles", "1", "👍👍", "🇺🇸🇨🇦", "\u200d", "\ufe0f", "🏽"):
        assert (await react(client, general["id"], bad)).status_code == 422, bad


async def test_reaction_concurrency_scope_archive_and_cascade(
    client,
    app,
    reaction_doc,
    foreign_project,
):
    document = reaction_doc["document"]
    comment = await create_comment(client, document["id"])
    first, second = await asyncio.gather(
        react(client, comment["id"], "😄"),
        react(client, comment["id"], "😄"),
    )
    assert (first.status_code, second.status_code) == (200, 200)

    ghost = "00000000-0000-0000-0000-000000000000"
    assert (await react(client, ghost)).status_code == 404

    async with app.state.sessionmaker() as session, session.begin():
        foreign_document = ProjectDocument(
            project_id=foreign_project["project_id"],
            title="남의 문서",
        )
        session.add(foreign_document)
        await session.flush()
        foreign_comment = ProjectDocumentComment(
            document_id=foreign_document.id,
            project_id=foreign_project["project_id"],
            author_id=foreign_project["user_id"],
            body="남의 코멘트",
        )
        session.add(foreign_comment)
        await session.flush()
        foreign_comment_id = foreign_comment.id
    assert (await react(client, foreign_comment_id)).status_code == 404

    assert (
        await client.post(f"/api/v1/projects/{reaction_doc['project_id']}/archive")
    ).status_code == 200
    assert (await react(client, comment["id"], "🎉")).status_code == 409
    assert (await unreact(client, comment["id"], "😄")).status_code == 409
    listed = await client.get(f"/api/v1/documents/{document['id']}/comments")
    assert listed.status_code == 200
    assert listed.json()["items"][0]["reactions"] == [{"key": "😄", "count": 1, "me": True}]
    await client.post(f"/api/v1/projects/{reaction_doc['project_id']}/unarchive")

    assert (await client.delete(f"/api/v1/documents/{document['id']}")).status_code == 204
    async with app.state.sessionmaker() as session:
        remaining = await session.scalar(select(ProjectDocumentCommentReaction).limit(1))
        assert remaining is None
        assert (
            await session.execute(text("SELECT count(*) FROM document_comment_reactions"))
        ).scalar_one() == 0
