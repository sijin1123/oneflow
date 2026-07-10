"""Project creation from a template project (expansion PLAN Pass 15 PR-AF).

Contract (v15.1): SETTINGS only (statuses/types/custom fields/automation) —
never content or members; the default seeds are SKIPPED in template mode;
copied automation rules start DISABLED with fresh fire counters; a template you
cannot see is a 404; response reports copy counts (never silent)."""

from tests.conftest import create_project, create_wp


async def _make_template(client) -> dict:
    tpl = await create_project(client, key="TPL", name="템플릿 프로젝트")
    pid = tpl["id"]
    # Customize every copied kind.
    statuses = (await client.get(f"/api/v1/projects/{pid}/statuses")).json()["items"]
    todo = next(s for s in statuses if s["key"] == "todo")
    await client.patch(f"/api/v1/projects/{pid}/statuses/{todo['id']}", json={"name": "대기열"})
    types = (await client.get(f"/api/v1/projects/{pid}/types")).json()["items"]
    bug = next(t for t in types if t["key"] == "bug")
    await client.patch(f"/api/v1/projects/{pid}/types/{bug['id']}", json={"is_active": False})
    await client.post(
        f"/api/v1/projects/{pid}/custom-fields",
        json={"name": "고객사", "field_type": "text", "applies_to": ["task"]},
    )
    await client.post(
        f"/api/v1/projects/{pid}/automation-rules",
        json={
            "name": "완료 시 긴급",
            "trigger_type": "status_changed_to",
            "trigger_value": "done",
            "action_type": "set_priority",
            "action_value": "urgent",
            "is_active": True,
        },
    )
    await create_wp(client, pid, subject="템플릿 안의 콘텐츠")  # must NOT copy
    return tpl


async def test_template_copies_settings_not_content(client):
    tpl = await _make_template(client)
    res = await client.post(
        "/api/v1/projects",
        json={"key": "FROMT", "name": "템플릿에서 생성", "template_project_id": tpl["id"]},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    applied = body["template_applied"]
    assert applied == {"statuses": 6, "types": 4, "custom_fields": 1, "automation_rules": 1}
    new_pid = body["id"]

    # Statuses carry the template's labels (seed was skipped, not doubled).
    statuses = (await client.get(f"/api/v1/projects/{new_pid}/statuses")).json()["items"]
    assert len(statuses) == 6
    assert next(s for s in statuses if s["key"] == "todo")["name"] == "대기열"

    # Types carry enablement; fields carry bindings.
    types = (await client.get(f"/api/v1/projects/{new_pid}/types")).json()["items"]
    assert next(t for t in types if t["key"] == "bug")["is_active"] is False
    fields = (await client.get(f"/api/v1/projects/{new_pid}/custom-fields")).json()["items"]
    assert [(f["name"], f["applies_to"]) for f in fields] == [("고객사", ["task"])]

    # Automation copies DISABLED with fresh counters (R1-④).
    rules = (await client.get(f"/api/v1/projects/{new_pid}/automation-rules")).json()["items"]
    assert len(rules) == 1
    assert rules[0]["is_active"] is False
    assert (rules[0]["fired_count"], rules[0]["last_fired_at"]) == (0, None)

    # Content never copies.
    wps = (await client.get(f"/api/v1/projects/{new_pid}/work-packages")).json()
    assert wps["total"] == 0


async def test_plain_create_still_seeds_defaults(client):
    res = await client.post("/api/v1/projects", json={"key": "PLAIN", "name": "무템플릿"})
    assert res.status_code == 201
    body = res.json()
    assert body["template_applied"] is None
    statuses = (await client.get(f"/api/v1/projects/{body['id']}/statuses")).json()["items"]
    assert len(statuses) == 6  # default seed intact (regression)


async def test_foreign_template_is_hidden(client, foreign_project):
    res = await client.post(
        "/api/v1/projects",
        json={
            "key": "SNEAK",
            "name": "남의 템플릿",
            "template_project_id": str(foreign_project["project_id"]),
        },
    )
    assert res.status_code == 404  # existence hiding


async def test_archived_template_is_usable(client):
    tpl = await _make_template(client)
    assert (await client.post(f"/api/v1/projects/{tpl['id']}/archive")).status_code == 200
    res = await client.post(
        "/api/v1/projects",
        json={"key": "FRARC", "name": "보관 템플릿", "template_project_id": tpl["id"]},
    )
    # Reads stay open on archived projects; the copy writes only to the NEW one.
    assert res.status_code == 201, res.text
    assert res.json()["template_applied"]["statuses"] == 6
