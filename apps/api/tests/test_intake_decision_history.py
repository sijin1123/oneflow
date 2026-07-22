"""Append-only intake triage decision history (UI-121)."""

import asyncio
import base64
import uuid

from sqlalchemy import delete, func, select

from app.models import IntakeDecisionHistory
from app.models.user import User
from app.services.storage_sweep import _fetch_keys_from_connection
from tests.conftest import create_project

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPkndLBwMDAxAAGAA2bAS37E8jFAAAAAElFTkSuQmCC"
)


def image_headers(revision: int) -> dict[str, str]:
    return {
        "content-type": "image/png",
        "If-Match": f'"{revision}"',
        "X-File-Name": "intake-reviewer.png",
    }


async def submit(client, project_id, title="이력 요청") -> dict:
    response = await client.post(
        f"/api/v1/projects/{project_id}/intake",
        json={"title": title},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def triage(client, project_id, item_id, status, **extra):
    return await client.post(
        f"/api/v1/projects/{project_id}/intake/{item_id}/triage",
        json={"status": status, **extra},
    )


async def history(client, project_id, item_id, query=""):
    return await client.get(f"/api/v1/projects/{project_id}/intake/{item_id}/history{query}")


async def test_history_retains_snooze_then_final_decision(client):
    project = await create_project(client, key="IHST", name="인테이크 이력")
    item = await submit(client, project["id"])

    first = await triage(
        client,
        project["id"],
        item["id"],
        "snoozed",
        note="다음 스프린트에 재검토",
        snooze_until="2026-08-01",
    )
    assert first.status_code == 200, first.text
    second = await triage(
        client,
        project["id"],
        item["id"],
        "accepted",
        note="범위를 확인해 작업으로 전환",
    )
    assert second.status_code == 200, second.text

    response = await history(client, project["id"], item["id"])
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["total"] == 2
    newest, older = payload["items"]
    assert (newest["previous_status"], newest["status"]) == ("snoozed", "accepted")
    assert newest["note"] == "범위를 확인해 작업으로 전환"
    assert newest["decided_by"] is not None
    assert newest["decided_by_name"] == "Dev User"
    assert (older["previous_status"], older["status"]) == ("pending", "snoozed")
    assert older["note"] == "다음 스프린트에 재검토"
    assert older["snooze_until"] == "2026-08-01"
    assert "@oneflow.local" not in response.text

    page = (await history(client, project["id"], item["id"], "?limit=1&offset=1")).json()
    assert page["total"] == 2
    assert len(page["items"]) == 1
    assert page["items"][0]["status"] == "snoozed"
    assert (await history(client, project["id"], item["id"], "?limit=101")).status_code == 422


async def test_failed_final_retriage_does_not_append_history(client):
    project = await create_project(client, key="I409", name="최종 상태 보호")
    item = await submit(client, project["id"])
    assert (await triage(client, project["id"], item["id"], "declined")).status_code == 200
    assert (await triage(client, project["id"], item["id"], "accepted")).status_code == 409
    payload = (await history(client, project["id"], item["id"])).json()
    assert payload["total"] == 1
    assert payload["items"][0]["status"] == "declined"


async def test_history_preserves_decider_identity_and_versioned_image(client, app):
    project = await create_project(client, key="IHIMG", name="판정자 이미지")
    uploaded = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers=image_headers(1),
    )
    assert uploaded.status_code == 200, uploaded.text
    item = await submit(client, project["id"])
    decided = await triage(
        client,
        project["id"],
        item["id"],
        "snoozed",
        note="이미지 교체 전 판정",
        snooze_until="2026-08-01",
    )
    assert decided.status_code == 200, decided.text

    event = (await history(client, project["id"], item["id"])).json()["items"][0]
    image_url = event["decided_by_profile_image_url"]
    assert event["decided_by_name"] == "Dev User"
    assert image_url.startswith(
        f"/api/v1/projects/{project['id']}/intake/{item['id']}/history/{event['id']}"
        "/actor-image?version="
    )
    assert (await client.get(image_url)).content == PNG

    async with app.state.sessionmaker() as session, session.begin():
        actor = await session.get(User, uuid.UUID(uploaded.json()["id"]))
        assert actor is not None
        actor.display_name = "Renamed Reviewer"
        decision = await session.get(IntakeDecisionHistory, uuid.UUID(event["id"]))
        assert decision is not None
        old_key = decision.decided_by_profile_image_storage_key
        assert old_key is not None

    replaced = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers=image_headers(2),
    )
    assert replaced.status_code == 200, replaced.text
    removed = await client.delete(
        "/api/v1/me/profile-image",
        headers={"If-Match": '"3"'},
    )
    assert removed.status_code == 200, removed.text

    preserved = (await history(client, project["id"], item["id"])).json()["items"][0]
    assert preserved["decided_by_name"] == "Dev User"
    assert preserved["decided_by_profile_image_url"] == image_url
    historical_image = await client.get(image_url)
    assert historical_image.status_code == 200
    assert historical_image.content == PNG
    assert historical_image.headers["cache-control"] == "private, no-store"
    stale_version = await client.get(image_url.rsplit("=", 1)[0] + f"={uuid.uuid4()}")
    assert stale_version.status_code == 404
    async with app.state.sessionmaker() as session:
        assert old_key in await _fetch_keys_from_connection(session)


async def test_repeated_snooze_records_each_successful_decision(client):
    project = await create_project(client, key="IHSNZ", name="보류 갱신")
    item = await submit(client, project["id"])
    assert (
        await triage(
            client,
            project["id"],
            item["id"],
            "snoozed",
            note="첫 검토",
            snooze_until="2026-08-01",
        )
    ).status_code == 200
    assert (
        await triage(
            client,
            project["id"],
            item["id"],
            "snoozed",
            note="일정 변경",
            snooze_until="2026-08-15",
        )
    ).status_code == 200

    payload = (await history(client, project["id"], item["id"])).json()
    assert payload["total"] == 2
    assert payload["items"][0]["previous_status"] == "snoozed"
    assert payload["items"][0]["status"] == "snoozed"
    assert payload["items"][0]["note"] == "일정 변경"
    assert payload["items"][0]["snooze_until"] == "2026-08-15"


async def test_concurrent_accept_leaves_exactly_one_history_event(client, app):
    project = await create_project(client, key="IHRACE", name="판정 경쟁")
    item = await submit(client, project["id"])
    first, second = await asyncio.gather(
        triage(client, project["id"], item["id"], "accepted"),
        triage(client, project["id"], item["id"], "accepted"),
    )
    assert sorted([first.status_code, second.status_code]) == [200, 409]
    async with app.state.sessionmaker() as session:
        count = await session.scalar(
            select(func.count())
            .select_from(IntakeDecisionHistory)
            .where(IntakeDecisionHistory.intake_item_id == item["id"])
        )
    assert count == 1


async def test_history_hides_foreign_and_other_member_items(client, app, member_project):
    uploaded = await client.put(
        "/api/v1/me/profile-image",
        content=PNG,
        headers=image_headers(1),
    )
    assert uploaded.status_code == 200, uploaded.text
    own = await submit(client, str(member_project["project_id"]), "내가 제출한 요청")
    other_item_id = None
    async with app.state.sessionmaker() as session, session.begin():
        from app.models import IntakeItem

        actor = await session.get(User, uuid.UUID(uploaded.json()["id"]))
        assert actor is not None
        other = IntakeItem(
            project_id=member_project["project_id"],
            title="다른 사용자의 요청",
            submitted_by=member_project["owner_id"],
        )
        session.add(other)
        await session.flush()
        session.add(
            IntakeDecisionHistory(
                intake_item_id=own["id"],
                previous_status="pending",
                status="snoozed",
                note="소유자 검토 예정",
                decided_by=member_project["owner_id"],
                decided_by_name_snapshot="Removed Owner",
                decided_by_profile_image_storage_key=actor.profile_image_storage_key,
                decided_by_profile_image_content_type=actor.profile_image_content_type,
            )
        )
        other_item_id = other.id

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(delete(User).where(User.id == member_project["owner_id"]))

    visible = await history(client, str(member_project["project_id"]), own["id"])
    assert visible.status_code == 200
    assert visible.json()["total"] == 1
    visible_event = visible.json()["items"][0]
    assert visible_event["decided_by"] is None
    assert visible_event["decided_by_name"] == "Removed Owner"
    image_url = visible_event["decided_by_profile_image_url"]
    assert (await client.get(image_url)).content == PNG
    mismatched_shape = image_url.replace(f"/intake/{own['id']}/", f"/intake/{other_item_id}/")
    assert (await client.get(mismatched_shape)).status_code == 404
    hidden = await history(client, str(member_project["project_id"]), str(other_item_id))
    assert hidden.status_code == 404
