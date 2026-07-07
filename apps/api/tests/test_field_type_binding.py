"""Custom field ↔ work-item type binding (expansion PLAN Pass 7 PR-S).

Contract: null = all types, [] rejected, subset validated (API and DB CHECK);
binding gates NEW values only (clearing allowed, stored values survive a type
change); PATCH null widens back to all types."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.conftest import create_project, create_wp


async def create_field(client, pid, name, applies_to=None, field_type="text"):
    body = {"name": name, "field_type": field_type}
    if applies_to is not None:
        body["applies_to"] = applies_to
    res = await client.post(f"/api/v1/projects/{pid}/custom-fields", json=body)
    return res


async def put_value(client, wp_id, field_id, value):
    return await client.put(
        f"/api/v1/work-packages/{wp_id}/custom-values",
        json={"values": [{"field_id": field_id, "value": value}]},
    )


@pytest.fixture
async def project(client):
    return await create_project(client, key="BIND", name="바인딩 프로젝트")


async def test_applies_to_validation(client, app, project):
    pid = project["id"]
    # Valid subset (de-duped) round-trips.
    res = await create_field(client, pid, "재현 절차", applies_to=["bug", "bug"])
    assert res.status_code == 201, res.text
    assert res.json()["applies_to"] == ["bug"]

    # [] and unknown keys are 422.
    assert (await create_field(client, pid, "빈 배열", applies_to=[])).status_code == 422
    assert (await create_field(client, pid, "이상 키", applies_to=["epic"])).status_code == 422

    # DB CHECK blocks API-bypassing garbage.
    with pytest.raises(IntegrityError):
        async with app.state.sessionmaker() as session, session.begin():
            await session.execute(
                text(
                    "UPDATE custom_fields SET applies_to = '[\"epic\"]'::jsonb WHERE name = :name"
                ).bindparams(name="재현 절차")
            )


async def test_binding_gates_new_values_only(client, project):
    pid = project["id"]
    field = (await create_field(client, pid, "재현 절차", applies_to=["bug"])).json()
    task_wp = await create_wp(client, pid, subject="작업", type="task")
    bug_wp = await create_wp(client, pid, subject="버그", type="bug")

    # Bound type writes; unbound type is a clean 422.
    assert (await put_value(client, bug_wp["id"], field["id"], "1. 재현")).status_code == 200
    res = await put_value(client, task_wp["id"], field["id"], "안 됨")
    assert res.status_code == 422
    assert "does not apply" in res.json()["detail"]

    # Type change AWAY from the binding: stored value survives and stays
    # readable; clearing (null) is still allowed; new writes are 422.
    res = await client.patch(
        f"/api/v1/work-packages/{bug_wp['id']}", json={"expected_version": 0, "type": "task"}
    )
    assert res.status_code == 200, res.text
    listed = (await client.get(f"/api/v1/work-packages/{bug_wp['id']}/custom-values")).json()
    assert listed["items"][0]["value"] == "1. 재현"
    assert (await put_value(client, bug_wp["id"], field["id"], "갱신")).status_code == 422
    assert (await put_value(client, bug_wp["id"], field["id"], None)).status_code == 200

    # null binding = every type (regression for unbound fields).
    open_field = (await create_field(client, pid, "메모")).json()
    assert open_field["applies_to"] is None
    assert (await put_value(client, task_wp["id"], open_field["id"], "됨")).status_code == 200


async def test_patch_binding_and_widen_back(client, project):
    pid = project["id"]
    field = (await create_field(client, pid, "심각도", applies_to=["bug"])).json()
    res = await client.patch(
        f"/api/v1/projects/{pid}/custom-fields/{field['id']}",
        json={"applies_to": ["bug", "feature"]},
    )
    assert res.status_code == 200
    assert res.json()["applies_to"] == ["bug", "feature"]

    # Explicit null widens back to all types.
    res = await client.patch(
        f"/api/v1/projects/{pid}/custom-fields/{field['id']}", json={"applies_to": None}
    )
    assert res.status_code == 200
    assert res.json()["applies_to"] is None
    task_wp = await create_wp(client, pid, subject="확장 확인", type="task")
    assert (await put_value(client, task_wp["id"], field["id"], "낮음")).status_code == 200
