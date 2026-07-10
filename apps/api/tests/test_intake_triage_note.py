"""Intake triage note + decision audit (expansion PLAN Pass 29 PR-AU).

Contract (v29.1): the note is optional PLAIN TEXT (no HTML surface — a script
tag round-trips verbatim as text), trim-empty normalizes to null, 2000-char
cap; every decision records triaged_by/triaged_at and ALWAYS replaces the
note; the read model exposes the actor ID only (no email rides along); the
submitter sees the reason on their own item."""

from tests.conftest import create_project


async def submit(client, pid, title="제안"):
    res = await client.post(f"/api/v1/projects/{pid}/intake", json={"title": title})
    return res.json()


async def triage(client, pid, item_id, status, **extra):
    return await client.post(
        f"/api/v1/projects/{pid}/intake/{item_id}/triage", json={"status": status, **extra}
    )


async def test_note_roundtrip_audit_and_plaintext(client):
    project = await create_project(client, key="TRGN", name="판정 사유")
    pid = project["id"]
    me = (await client.get("/api/v1/me")).json()["id"]
    item = await submit(client, pid)

    xss = "<script>alert(1)</script> 중복 제안이라 반려"
    res = await triage(client, pid, item["id"], "declined", note=xss)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["triage_note"] == xss  # plain text verbatim — never sanitized/encoded
    assert body["triaged_by_id"] == me
    assert body["triaged_at"] is not None
    # Minimal exposure: no email anywhere in the payload (R1-②).
    assert "@oneflow.local" not in res.text


async def test_note_normalization_and_cap(client):
    project = await create_project(client, key="TRGN2", name="정규화")
    pid = project["id"]

    a = await submit(client, pid, "공백 사유")
    res = await triage(client, pid, a["id"], "declined", note="   ")
    assert res.json()["triage_note"] is None  # whitespace-only → null

    b = await submit(client, pid, "무사유")
    res = await triage(client, pid, b["id"], "duplicate")
    assert res.json()["triage_note"] is None
    assert res.json()["triaged_by_id"] is not None  # audit still recorded

    c = await submit(client, pid, "길이 경계")
    assert (await triage(client, pid, c["id"], "declined", note="가" * 2000)).status_code == 200
    d = await submit(client, pid, "길이 초과")
    assert (await triage(client, pid, d["id"], "declined", note="가" * 2001)).status_code == 422


async def test_snooze_note_never_lingers_on_final_decision(client):
    project = await create_project(client, key="TRGN3", name="스누즈 사유")
    pid = project["id"]
    item = await submit(client, pid)

    res = await triage(
        client, pid, item["id"], "snoozed", note="다음 스프린트에 재검토", snooze_until="2026-08-01"
    )
    assert res.json()["triage_note"] == "다음 스프린트에 재검토"

    # The final decision REPLACES the note — omitted means null (R1-⑥).
    res = await triage(client, pid, item["id"], "accepted")
    assert res.status_code == 200, res.text
    assert res.json()["triage_note"] is None
    assert res.json()["accepted_wp_id"] is not None


async def test_submitter_sees_reason_on_own_item(client, member_project):
    """The dev user (plain member) submits; direct-DB owner decision is not
    possible here, so the OWNER path is covered above — this asserts the
    member's OWN-item read includes the note fields (visibility contract)."""
    pid = str(member_project["project_id"])
    item = await submit(client, pid, "멤버 제출")
    listed = (await client.get(f"/api/v1/projects/{pid}/intake")).json()
    mine = next(i for i in listed["items"] if i["id"] == item["id"])
    assert "triage_note" in mine and mine["triage_note"] is None  # null-visible shape
