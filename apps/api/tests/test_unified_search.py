"""Unified workspace search (expansion PLAN Pass 14 PR-AD).

Contract (v14.1): grouped results scoped to member projects (non-member and
archived projects never appear); documents/meetings match on TITLE only;
`returned` is the returned count and `truncated` comes from a limit+1 probe;
ordering — WPs updated_at desc, documents/meetings title asc, cycles/modules/
initiatives name asc, ties on id asc; %/_ are matched literally (autoescape);
q shorter than 2 chars is 422 (load control)."""

import pytest

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
