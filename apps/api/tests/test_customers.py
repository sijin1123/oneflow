import asyncio
from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.api.v1 import work_packages as work_package_routes
from app.core.auth import DEV_USER_EMAIL
from tests.conftest import create_project, create_wp


@pytest.fixture
async def customer_client(app, _clean_tables):
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(text("DELETE FROM customers"))
        await session.execute(
            text(
                "INSERT INTO workspace_feature_policies (feature_key, enabled, revision) "
                "VALUES ('customers', false, 1) "
                "ON CONFLICT (feature_key) DO UPDATE SET enabled = false, revision = 1"
            )
        )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def _enable(app) -> None:
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text(
                "UPDATE workspace_feature_policies SET enabled = true "
                "WHERE feature_key = 'customers'"
            )
        )


async def _create(client, name="Acme") -> dict:
    response = await client.post(
        "/api/v1/customers", json={"name": name, "email": "team@acme.test"}
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _set_policy(client, enabled: bool, revision: int):
    return await client.patch(
        "/api/v1/admin/workspace/features/customers",
        json={"enabled": enabled},
        headers={"If-Match": f'"{revision}"'},
    )


async def test_customers_policy_off_is_not_found(customer_client):
    assert (await customer_client.get("/api/v1/customers")).status_code == 404
    assert (
        await customer_client.post("/api/v1/customers", json={"name": "Acme"})
    ).status_code == 404


async def test_customers_permissions_and_lifecycle(customer_client, app):
    await _enable(app)
    customer = await _create(customer_client, "Acme Holdings")
    changed = await customer_client.patch(
        f"/api/v1/customers/{customer['id']}", json={"description": "Primary account"}
    )
    assert changed.status_code == 200
    assert changed.json()["description"] == "Primary account"
    assert (
        await customer_client.post(f"/api/v1/customers/{customer['id']}/archive")
    ).status_code == 200
    listed = await customer_client.get("/api/v1/customers")
    assert listed.json() == {"items": [], "total": 0}
    restored = await customer_client.post(f"/api/v1/customers/{customer['id']}/restore")
    assert restored.status_code == 200 and restored.json()["archived_at"] is None
    assert (await customer_client.get("/api/v1/customers", params={"query": "hold"})).json()[
        "total"
    ] == 1

    async with app.state.sessionmaker() as session, session.begin():
        user = (
            await session.execute(
                text("SELECT id FROM users WHERE email = :email"), {"email": DEV_USER_EMAIL}
            )
        ).scalar_one()
        await session.execute(
            text("UPDATE users SET is_admin = false WHERE id = :id"), {"id": user}
        )
    assert (await customer_client.get("/api/v1/customers")).status_code == 200
    assert (
        await customer_client.post("/api/v1/customers", json={"name": "Blocked"})
    ).status_code == 403


async def test_customer_rollup_excludes_invisible_projects(customer_client, app, foreign_project):
    await _enable(app)
    customer = await _create(customer_client)
    project = await create_project(customer_client, key="CUS")
    open_wp = await create_wp(
        customer_client,
        project["id"],
        "Open",
        due_date=(date.today() - timedelta(days=1)).isoformat(),
    )
    done_wp = await create_wp(customer_client, project["id"], "Done", status="done")
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text("UPDATE work_packages SET customer_id = :customer_id WHERE id = ANY(:ids)"),
            {
                "customer_id": customer["id"],
                "ids": [open_wp["id"], done_wp["id"], foreign_project["wp_id"]],
            },
        )
    response = await customer_client.get(f"/api/v1/customers/{customer['id']}")
    assert response.status_code == 200
    assert response.json()["progress"] == {
        "total": 2,
        "open": 1,
        "done": 1,
        "overdue": 1,
        "project_count": 1,
    }


async def test_customer_work_item_link_filter_saved_view_and_policy_preservation(
    customer_client,
):
    project = await create_project(customer_client, key="CLINK")
    pid = project["id"]
    blocked = await customer_client.post(
        f"/api/v1/projects/{pid}/work-packages",
        json={"subject": "Blocked", "customer_id": "00000000-0000-0000-0000-000000000001"},
    )
    assert blocked.status_code == 404

    assert (await _set_policy(customer_client, True, 1)).status_code == 200
    customer = await _create(customer_client, "Linked account")
    work = await create_wp(
        customer_client,
        pid,
        "Customer request",
        customer_id=customer["id"],
    )
    saved = await customer_client.post(
        f"/api/v1/projects/{pid}/saved-filters",
        json={"name": "Customer view", "params": {"customer_id": customer["id"]}},
    )
    assert saved.status_code == 201
    filtered = await customer_client.get(
        f"/api/v1/projects/{pid}/work-packages",
        params={"customer_id": customer["id"]},
    )
    assert filtered.status_code == 200
    assert [item["id"] for item in filtered.json()["items"]] == [work["id"]]

    assert (
        await customer_client.post(f"/api/v1/customers/{customer['id']}/archive")
    ).status_code == 200
    rejected = await customer_client.post(
        f"/api/v1/projects/{pid}/work-packages",
        json={"subject": "Archived", "customer_id": customer["id"]},
    )
    assert rejected.status_code == 422
    assert (await customer_client.get(f"/api/v1/work-packages/{work['id']}")).json()[
        "customer_id"
    ] == customer["id"]

    assert (await _set_policy(customer_client, False, 2)).status_code == 200
    hidden = await customer_client.get(f"/api/v1/work-packages/{work['id']}")
    assert hidden.json()["customer_id"] is None
    assert (
        await customer_client.get(
            f"/api/v1/projects/{pid}/work-packages",
            params={"customer_id": customer["id"]},
        )
    ).status_code == 404
    assert (await customer_client.get(f"/api/v1/projects/{pid}/saved-filters")).json() == {
        "items": [],
        "total": 0,
    }
    assert (
        await customer_client.patch(
            f"/api/v1/work-packages/{work['id']}",
            json={"expected_version": work["version"], "customer_id": None},
        )
    ).status_code == 404

    assert (await _set_policy(customer_client, True, 3)).status_code == 200
    restored = await customer_client.get(f"/api/v1/work-packages/{work['id']}")
    assert restored.json()["customer_id"] == customer["id"]
    assert (await customer_client.get(f"/api/v1/projects/{pid}/saved-filters")).json()["total"] == 1


async def test_customer_policy_disable_waits_for_customer_preserving_move(
    customer_client, monkeypatch
):
    source = await create_project(customer_client, key="CMOVE")
    target = await create_project(customer_client, key="CMOVE2")
    assert (await _set_policy(customer_client, True, 1)).status_code == 200
    customer = await _create(customer_client, "Move account")
    work = await create_wp(
        customer_client,
        source["id"],
        "Move with customer",
        customer_id=customer["id"],
    )

    original = work_package_routes.feature_policy
    policy_locked = asyncio.Event()
    release_move = asyncio.Event()
    gated = False

    async def gate_customer_policy(session, feature_key, *, for_update=False):
        nonlocal gated
        row = await original(session, feature_key, for_update=for_update)
        if feature_key == "customers" and for_update and not gated:
            gated = True
            policy_locked.set()
            await release_move.wait()
        return row

    monkeypatch.setattr(work_package_routes, "feature_policy", gate_customer_policy)
    move_task = asyncio.create_task(
        customer_client.post(
            f"/api/v1/work-packages/{work['id']}/move",
            json={
                "target_project_id": target["id"],
                "expected_version": work["version"],
                "dry_run": False,
            },
        )
    )
    await asyncio.wait_for(policy_locked.wait(), timeout=2)
    disable_task = asyncio.create_task(_set_policy(customer_client, False, 2))
    await asyncio.sleep(0.05)
    assert not disable_task.done()

    release_move.set()
    moved, disabled = await asyncio.gather(move_task, disable_task)
    assert moved.status_code == 200, moved.text
    assert moved.json()["work_package"]["customer_id"] == customer["id"]
    assert disabled.status_code == 200
    hidden = await customer_client.get(f"/api/v1/work-packages/{work['id']}")
    assert hidden.json()["customer_id"] is None
