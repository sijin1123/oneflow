"""Document inline images (Pass 68 PR-CH, v68.1).

The server is the boundary: on document save, an <img> survives only when its
src is the canonical download path of THIS document's own raster-image
attachment (project + document + content-type + blob all enforced — the
confused-deputy fix, R1-①); everything else drops the whole tag. Downloads
serve inline ONLY for the four raster types, with nosniff (R1-②/③).
"""

import uuid

import pytest

from tests.conftest import create_project


def _img(att_id: str) -> str:
    return f'<p>본문</p><img src="/api/v1/attachments/{att_id}/download" alt="그림">'


@pytest.fixture
async def doc_ctx(app, client, _clean_tables):
    project = await create_project(client, key="IMG")
    pid = project["id"]
    doc = (
        await client.post(f"/api/v1/projects/{pid}/documents", json={"title": "이미지 문서"})
    ).json()
    other_doc = (
        await client.post(f"/api/v1/projects/{pid}/documents", json={"title": "다른 문서"})
    ).json()
    return {"pid": pid, "doc": doc, "other_doc": other_doc}


async def _upload(client, pid, doc_id, filename="pic.png", ctype="image/png") -> str:
    res = await client.post(
        f"/api/v1/projects/{pid}/attachments/upload?filename={filename}&document_id={doc_id}",
        content=b"\x89PNG fake bytes",
        headers={"content-type": ctype},
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


async def _patch_body(client, doc, html):
    res = await client.patch(
        f"/api/v1/documents/{doc['id']}",
        json={"expected_version": doc["version"], "body": html},
    )
    assert res.status_code == 200, res.text
    return res.json()


async def test_own_document_image_survives_save(client, doc_ctx):
    att = await _upload(client, doc_ctx["pid"], doc_ctx["doc"]["id"])
    saved = await _patch_body(client, doc_ctx["doc"], _img(att))
    assert f"/api/v1/attachments/{att}/download" in saved["body"]
    assert 'alt="그림"' in saved["body"]


async def test_foreign_and_invalid_imgs_drop_whole_tag(app, client, doc_ctx, foreign_project):
    """Cross-project, another document's attachment, random id, non-image
    content type, external URL and data: URI all drop the ENTIRE tag."""
    pid, doc = doc_ctx["pid"], doc_ctx["doc"]
    other_docs_att = await _upload(client, pid, doc_ctx["other_doc"]["id"])
    pdf_att = await _upload(client, pid, doc["id"], filename="a.pdf", ctype="application/pdf")
    cases = [
        _img(other_docs_att),  # same project, other document (R1-①)
        _img(str(uuid.uuid4())),  # random id
        _img(pdf_att),  # own document but not a raster image
        '<img src="https://evil.example/pixel.png" alt="추적">',  # external
        '<img src="data:image/png;base64,AAAA">',  # data URI
        '<img alt="src 없음">',  # src-less (R1-⑥: never stored)
    ]
    for html in cases:
        doc = await _patch_body(client, doc, f"<p>유지</p>{html}")
        assert "<img" not in doc["body"], html
        assert "<p>유지</p>" in doc["body"]  # surrounding content intact


async def test_create_drops_images_and_meetings_never_allow_img(client, doc_ctx):
    pid = doc_ctx["pid"]
    att = await _upload(client, pid, doc_ctx["doc"]["id"])
    # CREATE cannot own an image yet — dropped (v68.1 R1-①).
    res = await client.post(
        f"/api/v1/projects/{pid}/documents", json={"title": "새 문서", "body": _img(att)}
    )
    assert res.status_code == 201
    assert "<img" not in (res.json()["body"] or "")
    # The base sanitize path (meetings agenda) never allows img at all (R1-⑥).
    res = await client.post(f"/api/v1/projects/{pid}/meetings", json={"title": "회의"})
    meeting = res.json()
    res = await client.patch(
        f"/api/v1/meetings/{meeting['id']}",
        json={"expected_version": meeting["version"], "agenda": _img(att)},
    )
    assert res.status_code == 200, res.text
    assert "<img" not in (res.json()["agenda"] or "")


async def test_download_inline_only_for_raster_images(client, doc_ctx):
    pid, doc = doc_ctx["pid"], doc_ctx["doc"]
    png = await _upload(client, pid, doc["id"])
    pdf = await _upload(client, pid, doc["id"], filename="b.pdf", ctype="application/pdf")
    svg = await _upload(client, pid, doc["id"], filename="c.svg", ctype="image/svg+xml")

    res = await client.get(f"/api/v1/attachments/{png}/download")
    assert res.status_code == 200
    assert res.headers["content-disposition"].startswith("inline;")
    assert res.headers["x-content-type-options"] == "nosniff"
    # Script-capable types stay forced downloads (never render on our origin).
    for att in (pdf, svg):
        res = await client.get(f"/api/v1/attachments/{att}/download")
        assert res.headers["content-disposition"].startswith("attachment;"), att
        assert res.headers["x-content-type-options"] == "nosniff"


async def test_deleted_attachment_image_drops_on_next_save(app, client, doc_ctx):
    pid, doc = doc_ctx["pid"], doc_ctx["doc"]
    att = await _upload(client, pid, doc["id"])
    doc = await _patch_body(client, doc, _img(att))
    assert "<img" in doc["body"]
    assert (await client.delete(f"/api/v1/attachments/{att}")).status_code == 204
    # The stored HTML keeps the tag (render 404s harmlessly); the NEXT save
    # re-validates and drops it.
    doc = await _patch_body(client, doc, doc["body"])
    assert "<img" not in doc["body"]
