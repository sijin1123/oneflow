"""Project custom fields (expansion PLAN Pass 3 PR-I).

Contract: owner-managed definitions (immutable type, RESTRICT-guarded delete,
is_active soft removal), member delta-upsert values validated per type at a
single fan-in, orphan dropdown values kept, member names resolved at read."""

import pytest

from tests.conftest import create_project, create_wp


async def create_field(client, project_id, name="심각도", field_type="dropdown", **extra) -> dict:
    body = {"name": name, "field_type": field_type, **extra}
    if field_type == "dropdown" and "options" not in body:
        body["options"] = ["낮음", "높음"]
    res = await client.post(f"/api/v1/projects/{project_id}/custom-fields", json=body)
    assert res.status_code == 201, res.text
    return res.json()


async def put_values(client, wp_id, values):
    return await client.put(f"/api/v1/work-packages/{wp_id}/custom-values", json={"values": values})


@pytest.fixture
async def project(client):
    return await create_project(client, key="CF", name="필드 프로젝트")


async def test_definition_crud_and_validation(client, project, member_project, foreign_project):
    pid = project["id"]
    f = await create_field(client, pid)
    assert f["position"] == 0
    assert f["is_active"] is True

    # Duplicate name 409; second field appends position.
    res = await client.post(
        f"/api/v1/projects/{pid}/custom-fields",
        json={"name": "심각도", "field_type": "text"},
    )
    assert res.status_code == 409
    second = await create_field(client, pid, name="담당 부서", field_type="text")
    assert second["position"] == 1

    # options only for dropdown; dropdown requires options; dup/empty options 422.
    res = await client.post(
        f"/api/v1/projects/{pid}/custom-fields",
        json={"name": "옵션 금지", "field_type": "text", "options": ["a"]},
    )
    assert res.status_code == 422
    res = await client.post(
        f"/api/v1/projects/{pid}/custom-fields",
        json={"name": "옵션 필요", "field_type": "dropdown"},
    )
    assert res.status_code == 422
    res = await client.post(
        f"/api/v1/projects/{pid}/custom-fields",
        json={"name": "중복 옵션", "field_type": "dropdown", "options": ["a", "a"]},
    )
    assert res.status_code == 422

    # Permission matrix.
    shared = str(member_project["project_id"])
    res = await client.post(
        f"/api/v1/projects/{shared}/custom-fields", json={"name": "멤버", "field_type": "text"}
    )
    assert res.status_code == 403
    foreign = str(foreign_project["project_id"])
    assert (await client.get(f"/api/v1/projects/{foreign}/custom-fields")).status_code == 404


async def test_value_types_roundtrip_and_422(client, project):
    pid = project["id"]
    wp = await create_wp(client, pid, subject="값 검증")
    me = (await client.get("/api/v1/me")).json()["id"]
    fields = {
        "text": await create_field(client, pid, name="메모", field_type="text"),
        "number": await create_field(client, pid, name="점수", field_type="number"),
        "boolean": await create_field(client, pid, name="승인", field_type="boolean"),
        "date": await create_field(client, pid, name="검토일", field_type="date"),
        "dropdown": await create_field(client, pid, name="등급", field_type="dropdown"),
        "member": await create_field(client, pid, name="검토자", field_type="member"),
        "url": await create_field(client, pid, name="링크", field_type="url"),
    }
    good = [
        {"field_id": fields["text"]["id"], "value": "  공백 정리  "},
        {"field_id": fields["number"]["id"], "value": 42.5},
        {"field_id": fields["boolean"]["id"], "value": True},
        {"field_id": fields["date"]["id"], "value": "2026-08-01"},
        {"field_id": fields["dropdown"]["id"], "value": "높음"},
        {"field_id": fields["member"]["id"], "value": me},
        {"field_id": fields["url"]["id"], "value": "https://wiki.example.com/spec"},
    ]
    res = await put_values(client, wp["id"], good)
    assert res.status_code == 200, res.text
    got = {i["field_id"]: i for i in res.json()["items"]}
    assert got[fields["text"]["id"]]["value"] == "공백 정리"  # trimmed
    assert got[fields["member"]["id"]]["member_display_name"]

    bad_cases = [
        (fields["number"]["id"], "사십이"),
        (fields["boolean"]["id"], "yes"),
        (fields["date"]["id"], "2026-13-01"),
        (fields["dropdown"]["id"], "없는 옵션"),
        (fields["member"]["id"], str(project["id"])),  # not a member uuid
        (fields["url"]["id"], "javascript:alert(1)"),
    ]
    for field_id, value in bad_cases:
        res = await put_values(client, wp["id"], [{"field_id": field_id, "value": value}])
        assert res.status_code == 422, (field_id, value, res.text)


async def test_bulk_is_atomic_and_delta(client, project):
    pid = project["id"]
    wp = await create_wp(client, pid, subject="원자성")
    memo = await create_field(client, pid, name="메모", field_type="text")
    score = await create_field(client, pid, name="점수", field_type="number")

    # One invalid entry → NOTHING saved.
    res = await put_values(
        client,
        wp["id"],
        [
            {"field_id": memo["id"], "value": "저장되면 안 됨"},
            {"field_id": score["id"], "value": "invalid"},
        ],
    )
    assert res.status_code == 422
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/custom-values")).json()
    assert listed["total"] == 0

    # Delta semantics: writing one field leaves the other untouched; null deletes.
    assert (
        await put_values(client, wp["id"], [{"field_id": memo["id"], "value": "하나"}])
    ).status_code == 200
    assert (
        await put_values(client, wp["id"], [{"field_id": score["id"], "value": 7}])
    ).status_code == 200
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/custom-values")).json()
    assert listed["total"] == 2
    assert (
        await put_values(client, wp["id"], [{"field_id": memo["id"], "value": None}])
    ).status_code == 200
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/custom-values")).json()
    assert {i["field_id"] for i in listed["items"]} == {score["id"]}


async def test_delete_guard_deactivation_and_orphans(client, project):
    pid = project["id"]
    wp = await create_wp(client, pid, subject="수명주기")
    grade = await create_field(client, pid, name="등급", field_type="dropdown")
    assert (
        await put_values(client, wp["id"], [{"field_id": grade["id"], "value": "높음"}])
    ).status_code == 200

    # Values exist → DELETE 409 (DB RESTRICT), with the count in the message.
    res = await client.delete(f"/api/v1/projects/{pid}/custom-fields/{grade['id']}")
    assert res.status_code == 409
    assert "1" in res.json()["detail"]

    # Deactivate: new writes 422, clearing (null) still allowed, value readable.
    res = await client.patch(
        f"/api/v1/projects/{pid}/custom-fields/{grade['id']}", json={"is_active": False}
    )
    assert res.status_code == 200
    res = await put_values(client, wp["id"], [{"field_id": grade["id"], "value": "낮음"}])
    assert res.status_code == 422
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/custom-values")).json()
    assert listed["total"] == 1

    # Orphan option: shrink options; the stored value survives reads.
    res = await client.patch(
        f"/api/v1/projects/{pid}/custom-fields/{grade['id']}", json={"options": ["낮음"]}
    )
    assert res.status_code == 200
    listed = (await client.get(f"/api/v1/work-packages/{wp['id']}/custom-values")).json()
    assert listed["items"][0]["value"] == "높음"

    # Clear the value → now hard delete succeeds.
    assert (
        await put_values(client, wp["id"], [{"field_id": grade["id"], "value": None}])
    ).status_code == 200
    res = await client.delete(f"/api/v1/projects/{pid}/custom-fields/{grade['id']}")
    assert res.status_code == 204

    # Inactive fields hidden by default, shown with include_inactive.
    hidden = await create_field(client, pid, name="숨김", field_type="text")
    await client.patch(
        f"/api/v1/projects/{pid}/custom-fields/{hidden['id']}", json={"is_active": False}
    )
    default = (await client.get(f"/api/v1/projects/{pid}/custom-fields")).json()
    assert all(i["id"] != hidden["id"] for i in default["items"])
    full = (
        await client.get(
            f"/api/v1/projects/{pid}/custom-fields", params={"include_inactive": "true"}
        )
    ).json()
    assert any(i["id"] == hidden["id"] for i in full["items"])


async def test_cross_project_field_and_immutable_type(client, project):
    other = await create_project(client, key="CFX", name="다른 프로젝트")
    foreign_field = await create_field(client, other["id"], name="남의 필드", field_type="text")
    wp = await create_wp(client, project["id"], subject="교차 필드")
    res = await put_values(client, wp["id"], [{"field_id": foreign_field["id"], "value": "x"}])
    assert res.status_code == 422

    # field_type is not an accepted PATCH property → unknown fields are ignored
    # by pydantic; verify the type cannot change via update payloads.
    res = await client.patch(
        f"/api/v1/projects/{other['id']}/custom-fields/{foreign_field['id']}",
        json={"field_type": "number", "name": "이름만 변경"},
    )
    assert res.status_code == 200
    assert res.json()["field_type"] == "text"


async def test_field_reorder(client, project, member_project):
    """Pass 50 PR-BP — the statuses /order contract verbatim: exact-set 422,
    atomic 0..n-1 rewrite, owner-only, archive write-gated."""
    pid = project["id"]
    ids = []
    for i, name in enumerate(["가 필드", "나 필드", "다 필드"]):
        res = await client.post(
            f"/api/v1/projects/{pid}/custom-fields",
            json={"name": name, "field_type": "text", "position": i},
        )
        assert res.status_code == 201, res.text
        ids.append(res.json()["id"])

    # Reversed order round-trips; the response comes back sorted.
    res = await client.put(
        f"/api/v1/projects/{pid}/custom-fields/order", json={"ordered_ids": list(reversed(ids))}
    )
    assert res.status_code == 200, res.text
    assert [f["id"] for f in res.json()["items"]] == list(reversed(ids))
    listed = (await client.get(f"/api/v1/projects/{pid}/custom-fields")).json()
    assert [f["id"] for f in listed["items"]] == list(reversed(ids))

    # Partial or foreign sets are a 422.
    assert (
        await client.put(
            f"/api/v1/projects/{pid}/custom-fields/order", json={"ordered_ids": ids[:2]}
        )
    ).status_code == 422

    # Non-owner 403; archive write-gate 409.
    shared = str(member_project["project_id"])
    assert (
        await client.put(f"/api/v1/projects/{shared}/custom-fields/order", json={"ordered_ids": []})
    ).status_code == 403
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (
        await client.put(f"/api/v1/projects/{pid}/custom-fields/order", json={"ordered_ids": ids})
    ).status_code == 409
    await client.post(f"/api/v1/projects/{pid}/unarchive")
