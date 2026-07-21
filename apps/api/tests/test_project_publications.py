import asyncio

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.main import create_app
from app.models import ProjectPublicationEvent
from tests.conftest import create_project, create_wp, make_test_settings


async def test_publish_public_summary_revoke_and_rotate(client, app):
    project = await create_project(client, key="PUB", name="공개 프로젝트")
    await client.patch(
        f"/api/v1/projects/{project['id']}",
        json={"description": "공개할 프로젝트 설명", "budget": 100_000},
    )
    await create_wp(client, project["id"], subject="숨겨야 하는 열린 작업")
    await create_wp(
        client,
        project["id"],
        subject="숨겨야 하는 완료 작업",
        status="done",
    )

    empty = await client.get(f"/api/v1/projects/{project['id']}/publication")
    assert empty.status_code == 200
    assert empty.json() == {
        "published": False,
        "public_id": None,
        "published_at": None,
        "revoked_at": None,
        "revision": 0,
    }

    first = await client.post(f"/api/v1/projects/{project['id']}/publication")
    assert first.status_code == 200
    first_id = first.json()["public_id"]
    assert first.json()["published"] is True
    assert first.json()["revision"] == 1

    # Publishing an already-public project is idempotent and does not append
    # duplicate audit events.
    duplicate = await client.post(f"/api/v1/projects/{project['id']}/publication")
    assert duplicate.json()["public_id"] == first_id
    async with app.state.sessionmaker() as session:
        events = (await session.execute(select(ProjectPublicationEvent))).scalars().all()
    assert [event.event_type for event in events] == ["published"]

    public = await client.get(f"/api/v1/public/projects/{first_id}")
    assert public.status_code == 200
    assert public.headers["cache-control"] == "no-store"
    body = public.json()
    assert body == {
        "public_id": first_id,
        "name": "공개 프로젝트",
        "description": "공개할 프로젝트 설명",
        "published_at": first.json()["published_at"],
        "work_package_count": 2,
        "open_work_package_count": 1,
        "completed_work_package_count": 1,
        "completion_percent": 50,
    }
    serialized = public.text
    assert "숨겨야 하는" not in serialized
    assert "budget" not in serialized
    assert "member" not in serialized
    assert "health" not in serialized

    revoked = await client.delete(f"/api/v1/projects/{project['id']}/publication")
    assert revoked.status_code == 200
    assert revoked.json()["published"] is False
    assert revoked.json()["public_id"] is None
    old = await client.get(f"/api/v1/public/projects/{first_id}")
    assert old.status_code == 404
    assert old.headers["cache-control"] == "no-store"

    republished = await client.post(f"/api/v1/projects/{project['id']}/publication")
    second_id = republished.json()["public_id"]
    assert second_id != first_id
    assert republished.json()["revision"] == 2
    assert (await client.get(f"/api/v1/public/projects/{first_id}")).status_code == 404
    assert (await client.get(f"/api/v1/public/projects/{second_id}")).status_code == 200

    async with app.state.sessionmaker() as session:
        events = (
            (
                await session.execute(
                    select(ProjectPublicationEvent).order_by(ProjectPublicationEvent.created_at)
                )
            )
            .scalars()
            .all()
        )
    assert [event.event_type for event in events] == ["published", "revoked", "published"]
    assert [event.revision for event in events] == [1, 1, 2]


async def test_public_read_needs_no_session_but_private_status_does(client):
    project = await create_project(client, key="UNA", name="비회원 공개")
    published = await client.post(f"/api/v1/projects/{project['id']}/publication")
    public_id = published.json()["public_id"]

    secured = create_app(
        make_test_settings(dev_login_required="true", dev_login_password="test-password")
    )
    try:
        transport = ASGITransport(app=secured)
        async with AsyncClient(transport=transport, base_url="http://test") as anonymous:
            assert (await anonymous.get(f"/api/v1/public/projects/{public_id}")).status_code == 200
            assert (
                await anonymous.get(f"/api/v1/projects/{project['id']}/publication")
            ).status_code == 401
    finally:
        await secured.state.engine.dispose()


async def test_publication_role_and_existence_boundaries(client, member_project, foreign_project):
    member_id = member_project["project_id"]
    foreign_id = foreign_project["project_id"]
    for method in ("get", "post", "delete"):
        assert (
            await getattr(client, method)(f"/api/v1/projects/{member_id}/publication")
        ).status_code == 403
        assert (
            await getattr(client, method)(f"/api/v1/projects/{foreign_id}/publication")
        ).status_code == 404


async def test_archive_revokes_publication_and_blocks_republish(client, app):
    project = await create_project(client, key="ARC", name="보관 공개")
    published = await client.post(f"/api/v1/projects/{project['id']}/publication")
    public_id = published.json()["public_id"]

    archived = await client.post(f"/api/v1/projects/{project['id']}/archive")
    assert archived.status_code == 200
    assert (await client.get(f"/api/v1/public/projects/{public_id}")).status_code == 404
    status = await client.get(f"/api/v1/projects/{project['id']}/publication")
    assert status.json()["published"] is False
    assert status.json()["revoked_at"] is not None
    assert (await client.post(f"/api/v1/projects/{project['id']}/publication")).status_code == 409
    assert (await client.delete(f"/api/v1/projects/{project['id']}/publication")).status_code == 200

    async with app.state.sessionmaker() as session:
        events = (
            (
                await session.execute(
                    select(ProjectPublicationEvent).order_by(ProjectPublicationEvent.created_at)
                )
            )
            .scalars()
            .all()
        )
    assert [event.event_type for event in events] == ["published", "revoked"]


async def test_concurrent_publish_returns_one_link_and_one_event(client, app):
    project = await create_project(client, key="RCE", name="동시 공개")
    first, second = await asyncio.gather(
        client.post(f"/api/v1/projects/{project['id']}/publication"),
        client.post(f"/api/v1/projects/{project['id']}/publication"),
    )
    assert first.status_code == second.status_code == 200
    assert first.json()["public_id"] == second.json()["public_id"]
    async with app.state.sessionmaker() as session:
        events = (await session.execute(select(ProjectPublicationEvent))).scalars().all()
    assert len(events) == 1
