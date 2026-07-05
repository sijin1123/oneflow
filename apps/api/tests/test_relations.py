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
