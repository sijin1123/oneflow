"""Saved filters → named views (expansion PLAN Pass 2 PR-F).

Contract: additive columns default existing rows to private list views; shared
views are member-visible only while the AUTHOR remains a member; edits/deletes
are author-only (404, existence hidden); layout/sort are enum-validated."""

import pytest
from sqlalchemy import delete

from app.models import ProjectMember, SavedFilter
from tests.conftest import create_project


@pytest.fixture
async def project(client):
    return await create_project(client, key="VIEW", name="뷰 프로젝트")


async def test_defaults_make_legacy_rows_private_list_views(client, project):
    """A create without the new fields behaves exactly like the old API."""
    res = await client.post(
        f"/api/v1/projects/{project['id']}/saved-filters",
        json={"name": "레거시 스타일", "params": {"status": "todo"}},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["layout"] == "list"
    assert body["sort"] is None
    assert body["is_shared"] is False
    assert body["is_mine"] is True
    assert body["owner_name"]


async def test_layout_and_sort_validation(client, project):
    res = await client.post(
        f"/api/v1/projects/{project['id']}/saved-filters",
        json={"name": "이상한 레이아웃", "layout": "gantt"},
    )
    assert res.status_code == 422
    res = await client.post(
        f"/api/v1/projects/{project['id']}/saved-filters",
        json={"name": "이상한 정렬", "sort": "priority"},
    )
    assert res.status_code == 422
    # cycle/module filter params must be UUID-shaped.
    res = await client.post(
        f"/api/v1/projects/{project['id']}/saved-filters",
        json={"name": "이상한 사이클", "params": {"cycle_id": "not-a-uuid"}},
    )
    assert res.status_code == 422


async def test_shared_view_visibility_and_author_only_edits(client, app, member_project):
    """The OWNER's shared view is visible to the dev member, but the dev cannot
    edit or delete it (404); the dev's own private view stays invisible to others."""
    pid = str(member_project["project_id"])
    owner_id = member_project["owner_id"]

    # The owner's shared + private views (direct rows — dev auth acts as dev).
    async with app.state.sessionmaker() as session, session.begin():
        session.add(
            SavedFilter(
                project_id=member_project["project_id"],
                user_id=owner_id,
                name="공유 보드",
                params={"status": "in_progress"},
                layout="board",
                is_shared=True,
            )
        )
        session.add(
            SavedFilter(
                project_id=member_project["project_id"],
                user_id=owner_id,
                name="비공개 목록",
                params={},
                layout="list",
                is_shared=False,
            )
        )

    listed = (await client.get(f"/api/v1/projects/{pid}/saved-filters")).json()
    names = {i["name"]: i for i in listed["items"]}
    assert "공유 보드" in names
    assert "비공개 목록" not in names  # others' private views stay hidden
    shared = names["공유 보드"]
    assert shared["is_mine"] is False
    assert shared["owner_name"] == "Owner"
    assert shared["layout"] == "board"

    # Author-only mutations: non-author gets 404 (existence already known via
    # sharing, but the mutation surface stays hidden/consistent).
    res = await client.patch(
        f"/api/v1/projects/{pid}/saved-filters/{shared['id']}", json={"name": "탈취"}
    )
    assert res.status_code == 404
    res = await client.delete(f"/api/v1/projects/{pid}/saved-filters/{shared['id']}")
    assert res.status_code == 404


async def test_departed_authors_shared_views_disappear(client, app, member_project):
    pid = str(member_project["project_id"])
    owner_id = member_project["owner_id"]
    async with app.state.sessionmaker() as session, session.begin():
        session.add(
            SavedFilter(
                project_id=member_project["project_id"],
                user_id=owner_id,
                name="떠난 작성자 뷰",
                params={},
                is_shared=True,
            )
        )
        await session.execute(
            delete(ProjectMember).where(
                ProjectMember.project_id == member_project["project_id"],
                ProjectMember.user_id == owner_id,
            )
        )

    listed = (await client.get(f"/api/v1/projects/{pid}/saved-filters")).json()
    assert all(i["name"] != "떠난 작성자 뷰" for i in listed["items"])


async def test_author_can_rename_relayout_and_toggle_share(client, project):
    created = (
        await client.post(
            f"/api/v1/projects/{project['id']}/saved-filters",
            json={"name": "내 뷰", "layout": "list"},
        )
    ).json()
    res = await client.patch(
        f"/api/v1/projects/{project['id']}/saved-filters/{created['id']}",
        json={"name": "내 보드", "layout": "board", "is_shared": True, "sort": "subject"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["name"], body["layout"], body["is_shared"], body["sort"]) == (
        "내 보드",
        "board",
        True,
        "subject",
    )
