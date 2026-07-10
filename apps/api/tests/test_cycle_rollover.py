"""Cycle rollover (expansion PLAN Pass 6 PR-P).

Contract: owner-only single-statement move of OPEN items; closed items stay;
reversible by rolling back the other way; target is validated as request data
(422); archive/membership gates apply."""

from datetime import timedelta

import pytest

from app.core.dates import utc_today
from tests.conftest import create_project, create_wp

TODAY = utc_today()  # cycle boundaries are UTC (Pass 46)


async def make_cycle(client, pid, name, start_offset, end_offset):
    res = await client.post(
        f"/api/v1/projects/{pid}/cycles",
        json={
            "name": name,
            "start_date": str(TODAY + timedelta(days=start_offset)),
            "end_date": str(TODAY + timedelta(days=end_offset)),
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


async def rollover(client, pid, source_id, target_id):
    return await client.post(
        f"/api/v1/projects/{pid}/cycles/{source_id}/rollover",
        json={"target_cycle_id": target_id},
    )


@pytest.fixture
async def setup(client):
    project = await create_project(client, key="ROL", name="이월 프로젝트")
    done_cycle = await make_cycle(client, project["id"], "지난 스프린트", -14, -1)
    next_cycle = await make_cycle(client, project["id"], "다음 스프린트", 0, 13)
    open_wp = await create_wp(client, project["id"], subject="미완료 A", cycle_id=done_cycle["id"])
    open_wp2 = await create_wp(client, project["id"], subject="미완료 B", cycle_id=done_cycle["id"])
    closed_wp = await create_wp(
        client, project["id"], subject="완료됨", cycle_id=done_cycle["id"], status="done"
    )
    return {
        "project": project,
        "source": done_cycle,
        "target": next_cycle,
        "open": [open_wp, open_wp2],
        "closed": closed_wp,
    }


async def test_rollover_moves_open_keeps_closed_and_reverses(client, setup):
    pid = setup["project"]["id"]
    res = await rollover(client, pid, setup["source"]["id"], setup["target"]["id"])
    assert res.status_code == 200, res.text
    assert res.json()["moved"] == 2

    for wp in setup["open"]:
        moved = (await client.get(f"/api/v1/work-packages/{wp['id']}")).json()
        assert moved["cycle_id"] == setup["target"]["id"]
    stayed = (await client.get(f"/api/v1/work-packages/{setup['closed']['id']}")).json()
    assert stayed["cycle_id"] == setup["source"]["id"]

    # Not destructive: the reverse rollover restores the grouping.
    res = await rollover(client, pid, setup["target"]["id"], setup["source"]["id"])
    assert res.json()["moved"] == 2
    back = (await client.get(f"/api/v1/work-packages/{setup['open'][0]['id']}")).json()
    assert back["cycle_id"] == setup["source"]["id"]

    # Idempotent-ish: nothing left to move.
    res = await rollover(client, pid, setup["target"]["id"], setup["source"]["id"])
    assert res.json()["moved"] == 0


async def test_rollover_validation(client, setup):
    pid = setup["project"]["id"]
    src = setup["source"]["id"]
    # Self-target 422.
    assert (await rollover(client, pid, src, src)).status_code == 422
    # Cross-project target 422 (request data, not a path resource).
    other = await create_project(client, key="ROX", name="다른 프로젝트")
    foreign = await make_cycle(client, other["id"], "남의 사이클", 0, 7)
    assert (await rollover(client, pid, src, foreign["id"])).status_code == 422


async def test_rollover_permissions_and_archive(client, setup, member_project, foreign_project):
    pid = setup["project"]["id"]
    src, tgt = setup["source"]["id"], setup["target"]["id"]

    # Plain member 403 / non-member 404 (on their respective projects).
    shared = str(member_project["project_id"])
    res = await client.post(
        f"/api/v1/projects/{shared}/cycles/{src}/rollover", json={"target_cycle_id": tgt}
    )
    assert res.status_code == 403
    foreign = str(foreign_project["project_id"])
    res = await client.post(
        f"/api/v1/projects/{foreign}/cycles/{src}/rollover", json={"target_cycle_id": tgt}
    )
    assert res.status_code == 404

    # Archived project → 409; restore reopens.
    assert (await client.post(f"/api/v1/projects/{pid}/archive")).status_code == 200
    assert (await rollover(client, pid, src, tgt)).status_code == 409
    await client.post(f"/api/v1/projects/{pid}/unarchive")
    assert (await rollover(client, pid, src, tgt)).status_code == 200
