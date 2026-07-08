"""Custom-field list columns (Pass 67 PR-CG, v67.1).

Batch value attachment on the work-package list (`custom_fields=` param) and
the `custom:<uuid>` saved-view column syntax. Guards under test: project-
scoped generic 422 for missing/foreign/inactive/malformed field ids (R1-②/③),
the normalization pipeline (R1-④), the ≤5 cap on ALL surfaces (R1-①), and
member-name resolution matching the single-WP contract.
"""

import uuid

from app.models import CustomField
from tests.conftest import create_project, create_wp


async def _field(client, pid, name, ftype="text", **extra):
    res = await client.post(
        f"/api/v1/projects/{pid}/custom-fields",
        json={"name": name, "field_type": ftype, **extra},
    )
    assert res.status_code == 201, res.text
    return res.json()


async def test_batch_values_attach_only_requested(app, client, dev_user):
    project = await create_project(client, key="CFC")
    pid = project["id"]
    f_env = await _field(client, pid, "환경")
    f_owner = await _field(client, pid, "담당 파트", ftype="member")
    f_other = await _field(client, pid, "미요청")
    wp1 = await create_wp(client, pid, subject="값 있는 작업")
    await create_wp(client, pid, subject="빈 작업")
    res = await client.put(
        f"/api/v1/work-packages/{wp1['id']}/custom-values",
        json={
            "values": [
                {"field_id": f_env["id"], "value": "스테이징"},
                {"field_id": f_owner["id"], "value": str(dev_user.id)},
                {"field_id": f_other["id"], "value": "이건 안 나옴"},
            ]
        },
    )
    assert res.status_code == 200, res.text

    # Without the param: no custom_values at all (additive optional).
    plain = (await client.get(f"/api/v1/projects/{pid}/work-packages")).json()
    assert all(i["custom_values"] is None for i in plain["items"])

    listed = (
        await client.get(
            f"/api/v1/projects/{pid}/work-packages?custom_fields={f_env['id']},{f_owner['id']}"
        )
    ).json()
    by_subject = {i["subject"]: i for i in listed["items"]}
    got = {v["field_id"]: v for v in by_subject["값 있는 작업"]["custom_values"]}
    assert got[f_env["id"]]["value"] == "스테이징"
    assert got[f_owner["id"]]["member_display_name"] == "Dev User"
    assert f_other["id"] not in got  # only requested fields
    assert by_subject["빈 작업"]["custom_values"] == []  # empty cell contract


async def test_param_normalization_and_cap(client):
    project = await create_project(client, key="CFN")
    pid = project["id"]
    fields = [await _field(client, pid, f"필드{i}") for i in range(6)]
    base = f"/api/v1/projects/{pid}/work-packages"
    f0 = fields[0]["id"]

    # Duplicates collapse (dedup BEFORE the cap): five distinct + one repeat OK.
    five = ",".join(f["id"] for f in fields[:5])
    res = await client.get(f"{base}?custom_fields={five},{f0}")
    assert res.status_code == 200
    # Six distinct → 422; empty token → 422; malformed uuid → 422.
    six = ",".join(f["id"] for f in fields)
    assert (await client.get(f"{base}?custom_fields={six}")).status_code == 422
    assert (await client.get(f"{base}?custom_fields={f0},,")).status_code == 422
    assert (await client.get(f"{base}?custom_fields=not-a-uuid")).status_code == 422
    # Whitespace around tokens is tolerated.
    res = await client.get(f"{base}?custom_fields= {f0} ")
    assert res.status_code == 200


async def test_foreign_random_inactive_same_generic_422(app, client, foreign_project):
    """R1-②/③ security regression: a foreign project's field id, a random id
    and an INACTIVE own field are byte-identical 422s — no existence leak."""
    project = await create_project(client, key="CFS")
    pid = project["id"]
    mine = await _field(client, pid, "내 필드")
    # A real field in the foreign project (dev is not a member there).
    async with app.state.sessionmaker() as session, session.begin():
        f = CustomField(
            project_id=foreign_project["project_id"], name="남의 필드", field_type="text"
        )
        session.add(f)
        await session.flush()
        foreign_id = str(f.id)
    # Deactivate my own second field.
    inactive = await _field(client, pid, "꺼진 필드")
    res = await client.patch(
        f"/api/v1/projects/{pid}/custom-fields/{inactive['id']}", json={"is_active": False}
    )
    assert res.status_code == 200, res.text

    base = f"/api/v1/projects/{pid}/work-packages"
    responses = []
    for bad in (foreign_id, str(uuid.uuid4()), inactive["id"]):
        r = await client.get(f"{base}?custom_fields={mine['id']},{bad}")
        responses.append((r.status_code, r.json()["detail"]))
    assert all(code == 422 for code, _ in responses)
    assert len({detail for _, detail in responses}) == 1  # identical message


async def test_saved_view_custom_column_syntax(client):
    project = await create_project(client, key="CFV")
    pid = project["id"]
    f = await _field(client, pid, "열 필드")
    key = f"custom:{f['id']}"

    # Built-ins normalize to canonical order; custom keys keep order after them.
    res = await client.post(
        f"/api/v1/projects/{pid}/saved-filters",
        json={"name": "커스텀 열 뷰", "params": {"columns": f"{key},status,type"}},
    )
    assert res.status_code == 201, res.text
    assert res.json()["params"]["columns"] == f"type,status,{key}"

    # Malformed custom key and >5 custom columns are 422s.
    res = await client.post(
        f"/api/v1/projects/{pid}/saved-filters",
        json={"name": "망가진 뷰", "params": {"columns": "custom:nope"}},
    )
    assert res.status_code == 422
    many = ",".join(f"custom:{uuid.uuid4()}" for _ in range(6))
    res = await client.post(
        f"/api/v1/projects/{pid}/saved-filters",
        json={"name": "과다 뷰", "params": {"columns": many}},
    )
    assert res.status_code == 422
