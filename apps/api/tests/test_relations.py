"""Relations read API: bidirectional + direction, DB same-project invariant (§6.1/§7)."""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.conftest import create_project, create_wp


@pytest.fixture
async def rel_setup(app, client):
    project = await create_project(client, key="REL", name="관계 테스트")
    a = await create_wp(client, project["id"], subject="A")
    b = await create_wp(client, project["id"], subject="B")
    c = await create_wp(client, project["id"], subject="C")
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text(
                "INSERT INTO work_package_relations "
                "(id, project_id, source_id, target_id, relation_type) VALUES "
                "(CAST(:i1 AS uuid), CAST(:p AS uuid), CAST(:a AS uuid), "
                "CAST(:b AS uuid), 'blocks'), "
                "(CAST(:i2 AS uuid), CAST(:p AS uuid), CAST(:a AS uuid), "
                "CAST(:c AS uuid), 'relates')"
            ).bindparams(
                i1=str(uuid.uuid4()),
                i2=str(uuid.uuid4()),
                p=project["id"],
                a=a["id"],
                b=b["id"],
                c=c["id"],
            )
        )
    return {"project": project, "a": a, "b": b, "c": c}


async def test_bidirectional_with_direction(client, rel_setup):
    res_a = await client.get(f"/api/v1/work-packages/{rel_setup['a']['id']}/relations")
    body = res_a.json()
    assert body["total"] == 2
    assert {i["direction"] for i in body["items"]} == {"outgoing"}
    res_b = await client.get(f"/api/v1/work-packages/{rel_setup['b']['id']}/relations")
    items = res_b.json()["items"]
    assert len(items) == 1
    assert items[0]["direction"] == "incoming"
    assert items[0]["relation_type"] == "blocks"


async def test_cross_project_relation_insert_rejected(app, rel_setup, foreign_project):
    # DB-level invariant: dual composite FKs make cross-project rows unrepresentable.
    async with app.state.sessionmaker() as session:
        with pytest.raises(IntegrityError):
            async with session.begin():
                await session.execute(
                    text(
                        "INSERT INTO work_package_relations "
                        "(id, project_id, source_id, target_id, relation_type) VALUES "
                        "(CAST(:i AS uuid), CAST(:p AS uuid), CAST(:src AS uuid), "
                        "CAST(:tgt AS uuid), 'relates')"
                    ).bindparams(
                        i=str(uuid.uuid4()),
                        p=rel_setup["project"]["id"],
                        src=rel_setup["a"]["id"],
                        tgt=str(foreign_project["wp_id"]),  # other project → FK violation
                    )
                )


async def test_nonmember_relations_hidden(client, foreign_project):
    res = await client.get(f"/api/v1/work-packages/{foreign_project['wp_id']}/relations")
    assert res.status_code == 404  # membership hiding (same-project relation, non-member caller)


async def test_relation_create_and_delete(client):
    project = await create_project(client, key="RW", name="관계 쓰기")
    a = await create_wp(client, project["id"], subject="A")
    b = await create_wp(client, project["id"], subject="B")

    res = await client.post(
        f"/api/v1/work-packages/{a['id']}/relations",
        json={"target_id": b["id"], "relation_type": "blocks"},
    )
    assert res.status_code == 201
    rel = res.json()
    assert rel["direction"] == "outgoing" and rel["relation_type"] == "blocks"

    # visible from both endpoints
    assert (await client.get(f"/api/v1/work-packages/{a['id']}/relations")).json()["total"] == 1
    b_rels = (await client.get(f"/api/v1/work-packages/{b['id']}/relations")).json()
    assert b_rels["items"][0]["direction"] == "incoming"

    # delete from the target's view too (relation touches b)
    deleted = await client.delete(
        f"/api/v1/work-packages/{b['id']}/relations/{rel['id']}"
    )
    assert deleted.status_code == 204
    assert (await client.get(f"/api/v1/work-packages/{a['id']}/relations")).json()["total"] == 0


async def test_relation_create_guards(client, foreign_project):
    project = await create_project(client, key="RG", name="관계 가드")
    a = await create_wp(client, project["id"], subject="A")

    # self relation → 422
    self_rel = await client.post(
        f"/api/v1/work-packages/{a['id']}/relations",
        json={"target_id": a["id"], "relation_type": "relates"},
    )
    assert self_rel.status_code == 422

    # cross-project target → 422
    cross = await client.post(
        f"/api/v1/work-packages/{a['id']}/relations",
        json={"target_id": str(foreign_project["wp_id"]), "relation_type": "relates"},
    )
    assert cross.status_code == 422

    # invalid relation_type → 422
    bad = await client.post(
        f"/api/v1/work-packages/{a['id']}/relations",
        json={"target_id": a["id"], "relation_type": "supersedes"},
    )
    assert bad.status_code == 422


async def test_relation_duplicate_409(client):
    project = await create_project(client, key="RD", name="관계 중복")
    a = await create_wp(client, project["id"], subject="A")
    b = await create_wp(client, project["id"], subject="B")
    payload = {"target_id": b["id"], "relation_type": "relates"}
    assert (
        await client.post(f"/api/v1/work-packages/{a['id']}/relations", json=payload)
    ).status_code == 201
    dup = await client.post(f"/api/v1/work-packages/{a['id']}/relations", json=payload)
    assert dup.status_code == 409


async def test_relation_write_nonmember_hidden(client, foreign_project):
    res = await client.post(
        f"/api/v1/work-packages/{foreign_project['wp_id']}/relations",
        json={"target_id": str(foreign_project["wp_id"]), "relation_type": "relates"},
    )
    assert res.status_code == 404
