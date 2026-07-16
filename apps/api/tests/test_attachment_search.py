from app.services.attachment_search import (
    MAX_ATTACHMENT_SEARCH_BYTES,
    extract_attachment_search_text,
)


def test_plain_text_extraction_normalizes_bom_controls_and_newlines(tmp_path):
    path = tmp_path / "notes.txt"
    path.write_bytes("\ufeff첫 줄\r\n둘\x00째 줄".encode())

    result = extract_attachment_search_text(
        path,
        content_type="text/plain; charset=utf-8",
        size_bytes=path.stat().st_size,
    )

    assert result.status == "indexed"
    assert result.text == "첫 줄\n둘째 줄"


def test_structured_text_requires_valid_json_and_flattens_csv(tmp_path):
    json_path = tmp_path / "valid.json"
    json_path.write_text('{"name": "OneFlow", "count": 2}', encoding="utf-8")
    valid = extract_attachment_search_text(
        json_path,
        content_type="application/json",
        size_bytes=json_path.stat().st_size,
    )
    assert valid.status == "indexed"
    assert valid.text == '{"name":"OneFlow","count":2}'

    invalid_path = tmp_path / "invalid.json"
    invalid_path.write_text('{"name":', encoding="utf-8")
    invalid = extract_attachment_search_text(
        invalid_path,
        content_type="application/json",
        size_bytes=invalid_path.stat().st_size,
    )
    assert invalid.status == "invalid_text"

    csv_path = tmp_path / "rows.csv"
    csv_path.write_text('title,owner\n"검색 문서","김 개발"\n', encoding="utf-8")
    csv_result = extract_attachment_search_text(
        csv_path,
        content_type="text/csv",
        size_bytes=csv_path.stat().st_size,
    )
    assert csv_result.status == "indexed"
    assert "검색 문서 김 개발" in (csv_result.text or "")


def test_extraction_is_bounded_even_when_size_metadata_is_missing(tmp_path):
    path = tmp_path / "large.txt"
    path.write_bytes(b"x" * (MAX_ATTACHMENT_SEARCH_BYTES + 1))

    result = extract_attachment_search_text(
        path,
        content_type="text/plain",
        size_bytes=None,
    )

    assert result.status == "too_large"
    assert result.text is None


def test_unsupported_type_does_not_probe_the_blob(tmp_path):
    missing = tmp_path / "missing.bin"
    result = extract_attachment_search_text(
        missing,
        content_type="application/octet-stream",
        size_bytes=12,
    )
    assert result.status == "unsupported"
