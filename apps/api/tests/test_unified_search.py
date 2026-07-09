"""Unified workspace search (expansion PLAN Pass 14 PR-AD).

Contract (v14.1): grouped results scoped to member projects (non-member and
archived projects never appear); documents/meetings match on TITLE only;
`returned` is the returned count and `truncated` comes from a limit+1 probe;
ordering — WPs updated_at desc, documents/meetings title asc, cycles/modules/
initiatives name asc, ties on id asc; %/_ are matched literally (autoescape);
q shorter than 2 chars is 422 (load control)."""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import delete as sa_delete

from app.models import (
    Cycle,
    Initiative,
    InitiativeProject,
    Meeting,
    Module,
    Project,
    ProjectDocument,
    ProjectMember,
)
from app.services.snippet import MAX_SNIPPET
from tests.conftest import create_project, create_wp


async def search(client, q, **params):
    qs = "&".join([f"q={q}"] + [f"{k}={v}" for k, v in params.items()])
    return await client.get(f"/api/v1/search?{qs}")


@pytest.fixture
async def project(client):
    return await create_project(client, key="FIND", name="검색 프로젝트")


async def test_groups_match_across_kinds(client, project):
    pid = project["id"]
    await create_wp(client, pid, subject="배포 파이프라인 작업")
    await client.post(f"/api/v1/projects/{pid}/documents", json={"title": "배포 가이드"})
    await client.post(f"/api/v1/projects/{pid}/meetings", json={"title": "배포 회의"})
    await client.post(
        f"/api/v1/projects/{pid}/cycles",
        json={"name": "배포 스프린트", "start_date": "2026-07-01", "end_date": "2026-07-14"},
    )
    await client.post(f"/api/v1/projects/{pid}/modules", json={"name": "배포 모듈"})
    await client.post("/api/v1/initiatives", json={"name": "배포 이니셔티브"})

    res = await search(client, "배포")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["work_packages"]["returned"] == 1
    assert body["documents"]["items"][0]["title"] == "배포 가이드"
    assert body["documents"]["items"][0]["project_key"] == "FIND"
    assert body["meetings"]["items"][0]["title"] == "배포 회의"
    assert body["cycles"]["items"][0]["name"] == "배포 스프린트"
    assert body["modules"]["items"][0]["name"] == "배포 모듈"
    assert body["initiatives"]["items"][0]["name"] == "배포 이니셔티브"
    assert all(
        body[g]["truncated"] is False
        for g in ("work_packages", "documents", "meetings", "cycles", "modules", "initiatives")
    )

    # Load control: a 1-char query is a 422.
    assert (await search(client, "배")).status_code == 422


async def test_scope_excludes_foreign_and_archived(client, project, foreign_project):
    pid = project["id"]
    await client.post(f"/api/v1/projects/{pid}/documents", json={"title": "스코프 문서"})

    # The foreign project's WP ('남의 작업') must not match even by substring.
    res = await search(client, "남의")
    body = res.json()
    assert body["work_packages"]["returned"] == 0

    # Archiving my project removes its results from search.
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    body = (await search(client, "스코프")).json()
    assert body["documents"]["returned"] == 0
    await client.post(f"/api/v1/projects/{pid}/unarchive")
    body = (await search(client, "스코프")).json()
    assert body["documents"]["returned"] == 1


async def test_hidden_only_matches_do_not_leak_counts_or_truncation(client, app, foreign_project):
    """Command-palette hardening (B-030 Pass 1A): hidden-only matches across
    every grouped kind must look like no matches, including returned counts and
    truncation probes."""
    token = "극비전역"
    foreign_pid = foreign_project["project_id"]
    foreign_user = foreign_project["user_id"]
    async with app.state.sessionmaker() as session, session.begin():
        session.add_all(
            [
                ProjectDocument(
                    project_id=foreign_pid,
                    title="숨김 문서",
                    body=f"<p>{token} 본문</p>",
                ),
                Meeting(project_id=foreign_pid, title="숨김 회의", agenda=f"<p>{token} 안건</p>"),
                Cycle(
                    project_id=foreign_pid,
                    name=f"{token} 사이클",
                    start_date=date(2026, 7, 1),
                    end_date=date(2026, 7, 14),
                ),
                Module(project_id=foreign_pid, name=f"{token} 모듈"),
            ]
        )
        initiative = Initiative(name=f"{token} 이니셔티브", owner_id=foreign_user)
        session.add(initiative)
        await session.flush()
        session.add(InitiativeProject(initiative_id=initiative.id, project_id=foreign_pid))

    body = (await search(client, token, limit=1)).json()
    for group in ("work_packages", "documents", "meetings", "cycles", "modules", "initiatives"):
        assert body[group]["items"] == []
        assert body[group]["returned"] == 0
        assert body[group]["truncated"] is False


async def test_query_time_membership_removal_hides_previous_results(client, app, member_project):
    """Search visibility is evaluated at query time. If membership is removed
    after a result was visible, the next response must not retain it."""
    pid = member_project["project_id"]
    dev_id = member_project["dev_id"]
    token = "멤버십제거"
    async with app.state.sessionmaker() as session, session.begin():
        session.add(ProjectDocument(project_id=pid, title=f"{token} 문서"))

    assert (await search(client, token)).json()["documents"]["returned"] == 1

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            sa_delete(ProjectMember).where(
                ProjectMember.project_id == pid,
                ProjectMember.user_id == dev_id,
            )
        )

    body = (await search(client, token)).json()
    assert body["documents"]["returned"] == 0


async def test_initiative_search_respects_mixed_visibility(client, app, member_project):
    """An initiative connected only to foreign projects is hidden. Connecting
    one visible project makes the initiative itself visible without exposing
    project rollup/count details through search."""
    token = "혼합가시성"
    owner_id = member_project["owner_id"]
    visible_pid = member_project["project_id"]
    async with app.state.sessionmaker() as session, session.begin():
        private = Project(key="MXV", name="검색 숨김 프로젝트")
        session.add(private)
        await session.flush()
        hidden = Initiative(name=f"{token} 숨김", owner_id=owner_id)
        visible = Initiative(name=f"{token} 표시", owner_id=owner_id)
        session.add_all([hidden, visible])
        await session.flush()
        session.add_all(
            [
                InitiativeProject(initiative_id=hidden.id, project_id=private.id),
                InitiativeProject(initiative_id=visible.id, project_id=private.id),
                InitiativeProject(initiative_id=visible.id, project_id=visible_pid),
            ]
        )

    names = [i["name"] for i in (await search(client, token)).json()["initiatives"]["items"]]
    assert f"{token} 표시" in names
    assert f"{token} 숨김" not in names

    async with app.state.sessionmaker() as session, session.begin():
        project = await session.get(Project, visible_pid)
        assert project is not None
        project.archived_at = datetime.now(UTC)

    names = [i["name"] for i in (await search(client, token)).json()["initiatives"]["items"]]
    assert f"{token} 표시" not in names


async def test_truncation_probe_and_ordering(client, project):
    pid = project["id"]
    for i in range(3):
        await client.post(
            f"/api/v1/projects/{pid}/documents", json={"title": f"절단 확인 {chr(0xAC00 + i)}"}
        )

    body = (await search(client, "절단 확인", limit=2)).json()
    assert body["documents"]["returned"] == 2
    assert body["documents"]["truncated"] is True
    # title asc ordering (가 < 각 < 간).
    titles = [d["title"] for d in body["documents"]["items"]]
    assert titles == sorted(titles)

    body = (await search(client, "절단 확인", limit=3)).json()
    assert body["documents"]["returned"] == 3
    assert body["documents"]["truncated"] is False


async def test_wildcards_are_literal(client, project):
    pid = project["id"]
    await client.post(f"/api/v1/projects/{pid}/documents", json={"title": "백분율 100% 정리"})
    await client.post(f"/api/v1/projects/{pid}/documents", json={"title": "백분율 100X 정리"})

    body = (await search(client, "100%")).json()
    assert [d["title"] for d in body["documents"]["items"]] == ["백분율 100% 정리"]


async def test_content_match_and_snippet(client, app):
    """Pass 39 PR-BE (v39.1): content predicates stay INSIDE the member/
    archive scope; primary wins over content (snippet null); markup-only
    matches keep snippet null; non-member content never leaks."""

    from tests.conftest import create_project, create_wp

    project = await create_project(client, key="FTS", name="본문 검색")
    pid = project["id"]
    # WP: the query hits only the description.
    wp = await create_wp(client, pid, subject="제목은 다름")
    await client.patch(
        f"/api/v1/work-packages/{wp['id']}",
        json={"expected_version": 0, "description": "<p>배포 파이프라인 점검이 필요합니다</p>"},
    )
    # Document: body-only match + a markup-only match (href).
    doc = (
        await client.post(
            f"/api/v1/projects/{pid}/documents",
            json={"title": "가이드", "body": "<p>파이프라인 정리 문서</p>"},
        )
    ).json()
    link_doc = (
        await client.post(
            f"/api/v1/projects/{pid}/documents",
            json={
                "title": "링크 모음",
                "body": '<p><a href="https://x.test/pipeline-zzz">링크</a></p>',
            },
        )
    ).json()
    del doc

    res = (await client.get("/api/v1/search?q=파이프라인")).json()
    wp_hit = next(i for i in res["work_packages"]["items"] if i["id"] == wp["id"])
    assert wp_hit["matched_in"] == "content"
    assert "파이프라인" in wp_hit["snippet"]
    doc_hits = {d["title"]: d for d in res["documents"]["items"]}
    assert doc_hits["가이드"]["matched_in"] == "content"
    assert "파이프라인" in doc_hits["가이드"]["snippet"]

    # Markup-only match (URL inside href): item returns, snippet stays null
    # (recorded limitation — R1-④).
    res2 = (await client.get("/api/v1/search?q=pipeline-zzz")).json()
    only = {d["title"]: d for d in res2["documents"]["items"]}
    assert only["링크 모음"]["matched_in"] == "content"
    assert only["링크 모음"]["snippet"] is None
    assert link_doc["id"] == only["링크 모음"]["id"]

    # Primary wins when both match: subject contains the query too.
    wp2 = await create_wp(client, pid, subject="파이프라인 개편")
    await client.patch(
        f"/api/v1/work-packages/{wp2['id']}",
        json={"expected_version": 0, "description": "<p>파이프라인 상세</p>"},
    )
    res3 = (await client.get("/api/v1/search?q=파이프라인")).json()
    both = next(i for i in res3["work_packages"]["items"] if i["id"] == wp2["id"])
    assert (both["matched_in"], both["snippet"]) == ("primary", None)


async def test_snippet_is_plain_text_bounded_and_control_free(client, project):
    pid = project["id"]
    token = "안전스니펫"
    noisy = "\x00" + ("앞" * 120) + f"<script>alert(1)</script><p>{token}&amp;확인</p>"
    await client.post(f"/api/v1/projects/{pid}/documents", json={"title": "스니펫", "body": noisy})

    doc = (await search(client, token)).json()["documents"]["items"][0]
    snippet = doc["snippet"]
    assert doc["matched_in"] == "content"
    assert snippet is not None
    assert token in snippet
    assert "<script" not in snippet
    assert "alert(1)" not in snippet
    assert "\x00" not in snippet
    assert len(snippet) <= MAX_SNIPPET


async def test_content_never_leaks_foreign_projects(client, app, foreign_project):
    """A query that exists ONLY in a non-member project's body stays hidden."""
    from sqlalchemy import text as sa_text

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            sa_text(
                "UPDATE work_packages SET description = '<p>극비-본문-토큰</p>' "
                "WHERE id = CAST(:id AS uuid)"
            ).bindparams(id=str(foreign_project["wp_id"]))
        )
    res = (await client.get("/api/v1/search?q=극비-본문-토큰")).json()
    assert res["work_packages"]["returned"] == 0
    assert all(res[g]["returned"] == 0 for g in ("documents", "meetings", "cycles", "modules"))
