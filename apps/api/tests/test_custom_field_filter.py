"""Custom-field list filter (Pass 80 PR-CS, v80.1).

Single field, two ops: eq (canonical text match per type) and has (value
present). EXISTS subquery — no join multiplication. Field validation reuses
the Pass 67 project-scoped generic 422; typed cf_value gets its own 422.
"""

import uuid

from tests.conftest import create_project, create_wp


async def _field(client, pid, name, ftype="text", **extra):
    res = await client.post(
        f"/api/v1/projects/{pid}/custom-fields",
        json={"name": name, "field_type": ftype, **extra},
    )
    assert res.status_code == 201, res.text
    return res.json()


async def _set_value(client, wp_id, field_id, value):
    res = await client.put(
        f"/api/v1/work-packages/{wp_id}/custom-values",
        json={"values": [{"field_id": field_id, "value": value}]},
    )
    assert res.status_code == 200, res.text


async def _keys(client, pid, query):
    res = await client.get(f"/api/v1/projects/{pid}/work-packages?{query}")
    assert res.status_code == 200, res.text
    return sorted(w["subject"] for w in res.json()["items"])


async def test_eq_matches_per_type(client, dev_user):
    project = await create_project(client, key="CFF")
    pid = project["id"]
    f_env = await _field(client, pid, "환경")
    f_num = await _field(client, pid, "가중치", ftype="number")
    f_flag = await _field(client, pid, "긴급", ftype="boolean")
    f_owner = await _field(client, pid, "담당", ftype="member")
    a = await create_wp(client, pid, subject="A")
    b = await create_wp(client, pid, subject="B")
    await create_wp(client, pid, subject="C")  # no values
    await _set_value(client, a["id"], f_env["id"], "스테이징")
    await _set_value(client, a["id"], f_num["id"], 5)
    await _set_value(client, a["id"], f_flag["id"], True)
    await _set_value(client, a["id"], f_owner["id"], str(dev_user.id))
    await _set_value(client, b["id"], f_env["id"], "운영")
    await _set_value(client, b["id"], f_num["id"], 5)

    assert await _keys(client, pid, f"cf_field={f_env['id']}&cf_op=eq&cf_value=스테이징") == ["A"]
    assert await _keys(client, pid, f"cf_field={f_num['id']}&cf_op=eq&cf_value=5") == ["A", "B"]
    assert await _keys(client, pid, f"cf_field={f_flag['id']}&cf_op=eq&cf_value=true") == ["A"]
    assert await _keys(
        client, pid, f"cf_field={f_owner['id']}&cf_op=eq&cf_value={dev_user.id}"
    ) == ["A"]
    # No-value WP (C) never matches eq or has.
    assert "C" not in await _keys(client, pid, f"cf_field={f_env['id']}&cf_op=has")


async def test_has_and_and_composition(client):
    project = await create_project(client, key="CFH")
    pid = project["id"]
    f = await _field(client, pid, "환경")
    a = await create_wp(client, pid, subject="A", status="done")
    b = await create_wp(client, pid, subject="B")
    await _set_value(client, a["id"], f["id"], "x")
    await _set_value(client, b["id"], f["id"], "y")

    assert await _keys(client, pid, f"cf_field={f['id']}&cf_op=has") == ["A", "B"]
    # Composes as an AND with the built-in filters.
    assert await _keys(client, pid, f"cf_field={f['id']}&cf_op=has&status=done") == ["A"]


async def test_no_multiplication_with_many_values(client):
    """Two custom fields set on one WP must not double it in the result."""
    project = await create_project(client, key="CFM")
    pid = project["id"]
    f1 = await _field(client, pid, "환경")
    f2 = await _field(client, pid, "지역")
    a = await create_wp(client, pid, subject="A")
    await _set_value(client, a["id"], f1["id"], "x")
    await _set_value(client, a["id"], f2["id"], "y")
    res = await client.get(f"/api/v1/projects/{pid}/work-packages?cf_field={f1['id']}&cf_op=has")
    body = res.json()
    assert [w["subject"] for w in body["items"]] == ["A"]  # exactly once
    assert body["total"] == 1


async def test_validation_matrix_422(client, foreign_project):
    project = await create_project(client, key="CFV")
    pid = project["id"]
    num = await _field(client, pid, "숫자", ftype="number")
    inactive = await _field(client, pid, "꺼짐")
    await client.patch(
        f"/api/v1/projects/{pid}/custom-fields/{inactive['id']}", json={"is_active": False}
    )
    base = f"/api/v1/projects/{pid}/work-packages"
    # Field: foreign / random / inactive → generic field 422.
    for bad in (str(uuid.uuid4()), inactive["id"]):
        r = await client.get(f"{base}?cf_field={bad}&cf_op=has")
        assert r.status_code == 422
    # op invalid.
    assert (await client.get(f"{base}?cf_field={num['id']}&cf_op=gt")).status_code == 422
    # eq missing value.
    assert (await client.get(f"{base}?cf_field={num['id']}&cf_op=eq")).status_code == 422
    # typed value errors (distinct 422).
    assert (
        await client.get(f"{base}?cf_field={num['id']}&cf_op=eq&cf_value=nope")
    ).status_code == 422


async def test_saved_view_carries_custom_filter(client):
    project = await create_project(client, key="CFS")
    pid = project["id"]
    f = await _field(client, pid, "환경")
    res = await client.post(
        f"/api/v1/projects/{pid}/saved-filters",
        json={
            "name": "스테이징 뷰",
            "params": {"cf_field": f["id"], "cf_op": "eq", "cf_value": "스테이징"},
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["params"]["cf_field"] == f["id"]
    assert res.json()["params"]["cf_value"] == "스테이징"
