"""Korean ICU collation sort (PLAN §3 Phase 1 후속 ICU 콜레이션)."""

import pytest

from tests.conftest import create_project, create_wp


@pytest.fixture
async def project(client):
    return await create_project(client, key="COLL", name="정렬")


async def test_sort_by_subject_uses_korean_dictionary_order(client, project):
    pid = project["id"]
    # inserted out of dictionary order
    for subject in ("바나나", "가지", "사과", "라면"):
        await create_wp(client, pid, subject=subject)

    listed = (await client.get(f"/api/v1/projects/{pid}/work-packages?sort=subject")).json()
    subjects = [w["subject"] for w in listed["items"]]
    # ㄱ < ㄹ < ㅂ < ㅅ dictionary order
    assert subjects == ["가지", "라면", "바나나", "사과"]


async def test_default_sort_is_creation_order(client, project):
    pid = project["id"]
    for subject in ("바나나", "가지", "사과"):
        await create_wp(client, pid, subject=subject)

    listed = (await client.get(f"/api/v1/projects/{pid}/work-packages")).json()
    subjects = [w["subject"] for w in listed["items"]]
    assert subjects == ["바나나", "가지", "사과"]  # insertion order preserved


async def test_subject_filter_still_works_with_collation(client, project):
    pid = project["id"]
    await create_wp(client, pid, subject="사과 파이")
    await create_wp(client, pid, subject="바나나 우유")
    # ILIKE on subject must still work (deterministic collation permits LIKE)
    listed = (await client.get(f"/api/v1/projects/{pid}/work-packages?sort=subject&q=파이")).json()
    assert listed["total"] == 1
    assert listed["items"][0]["subject"] == "사과 파이"


async def test_invalid_sort_value_422(client, project):
    pid = project["id"]
    assert (await client.get(f"/api/v1/projects/{pid}/work-packages?sort=bogus")).status_code == 422
