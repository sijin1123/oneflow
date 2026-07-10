"""External-tracker import adapters (expansion Pass 8 PR-T).

File-based, credential-free: an adapter turns a foreign export into the
internal IMPORT_COLUMNS payload shape and lets the existing CSV machinery do
row-level validation, disabled-type isolation, dry-run, and insertion.

v1 ships the Jira CSV adapter; the mapping tables are deterministic and
case-insensitive. Distortion policy (PLAN v8.1): an unknown STATUS isolates
the row (a wrong status corrupts progress/dashboards), while unknown type/
priority fall back (task/none) with a count surfaced in `notes` — and every
ignored column is named once, so nothing is lost silently.
"""

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date

# Recognized Jira CSV headers (lowercased). Everything else is reported once
# in notes as ignored — silent loss is not allowed.
_H_SUMMARY = "summary"
_H_DESCRIPTION = "description"
_H_TYPE = ("issue type", "issuetype")
_H_STATUS = "status"
_H_PRIORITY = "priority"
_H_DUE = ("due date", "due", "duedate")
_H_KEY = ("issue key", "key", "issue id")
_H_ASSIGNEE = ("assignee", "reporter")

TYPE_MAP = {
    "bug": "bug",
    "epic": "feature",
    "story": "task",
    "task": "task",
    "sub-task": "task",
    "subtask": "task",
}

STATUS_MAP = {
    "to do": "todo",
    "todo": "todo",
    "in progress": "in_progress",
    "in review": "in_review",
    "done": "done",
    "closed": "done",
    "resolved": "done",
    "backlog": "backlog",
}

PRIORITY_MAP = {
    "highest": "urgent",
    "high": "high",
    "medium": "medium",
    "low": "low",
    "lowest": "low",
}

_MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}
_JIRA_DATE_RE = re.compile(r"^(\d{1,2})/([A-Za-z]{3})/(\d{2}|\d{4})$")


def _parse_jira_date(raw: str) -> str:
    """ISO or Jira's d/MMM/yy(yyyy) with ENGLISH month abbreviations only
    (documented limitation); two-digit years read as 2000+yy. Raises ValueError."""
    try:
        return date.fromisoformat(raw).isoformat()
    except ValueError:
        pass
    m = _JIRA_DATE_RE.match(raw)
    if not m:
        raise ValueError(f"unsupported date format: {raw!r}")
    day, mon, year = int(m.group(1)), m.group(2).lower(), int(m.group(3))
    if mon not in _MONTHS:
        raise ValueError(f"unknown month abbreviation: {raw!r}")
    if year < 100:
        year += 2000
    return date(year, _MONTHS[mon], day).isoformat()


@dataclass
class JiraMapResult:
    header_error: str | None = None
    # (row_number, payload | None, error | None, raw_line)
    rows: list[tuple[int, dict | None, str | None, str]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def map_jira_csv(content: str) -> JiraMapResult:
    result = JiraMapResult()
    reader = csv.reader(io.StringIO(content))
    try:
        header = next(reader)
    except StopIteration:
        result.header_error = "CSV is empty"
        return result

    lowered = [h.lstrip("﻿").strip().lower() for h in header]
    idx: dict[str, int] = {}
    ignored: list[str] = []
    assignee_cols: list[int] = []
    for i, name in enumerate(lowered):
        if name == _H_SUMMARY and "summary" not in idx:
            idx["summary"] = i
        elif name == _H_DESCRIPTION and "description" not in idx:
            idx["description"] = i
        elif name in _H_TYPE and "type" not in idx:
            idx["type"] = i
        elif name == _H_STATUS and "status" not in idx:
            idx["status"] = i
        elif name == _H_PRIORITY and "priority" not in idx:
            idx["priority"] = i
        elif name in _H_DUE and "due" not in idx:
            idx["due"] = i
        elif name in _H_KEY and "key" not in idx:
            idx["key"] = i
        elif name in _H_ASSIGNEE:
            assignee_cols.append(i)
        else:
            ignored.append(header[i].strip() or "(빈 헤더)")

    if "summary" not in idx:
        result.header_error = "Jira CSV header must include a 'Summary' column"
        return result

    unknown_types = 0
    unknown_priorities = 0
    assignee_values = 0
    row_number = 0

    def cell(row: list[str], key: str) -> str:
        i = idx.get(key)
        return row[i].strip() if i is not None and i < len(row) else ""

    for row in reader:
        if not any(c.strip() for c in row):
            continue
        row_number += 1
        raw = ",".join(row)

        summary = cell(row, "summary")
        if not summary:
            result.rows.append((row_number, None, "Summary: 값이 비어 있습니다", raw))
            continue

        raw_status = cell(row, "status")
        if raw_status and raw_status.lower() not in STATUS_MAP:
            # A wrong status corrupts progress — isolate instead of guessing.
            result.rows.append((row_number, None, f"Status: 매핑할 수 없는 값 '{raw_status}'", raw))
            continue

        raw_due = cell(row, "due")
        due: str | None = None
        if raw_due:
            try:
                due = _parse_jira_date(raw_due)
            except ValueError:
                result.rows.append(
                    (row_number, None, f"Due date: 지원하지 않는 형식 '{raw_due}'", raw)
                )
                continue

        raw_type = cell(row, "type")
        if raw_type and raw_type.lower() not in TYPE_MAP:
            unknown_types += 1
        raw_priority = cell(row, "priority")
        if raw_priority and raw_priority.lower() not in PRIORITY_MAP:
            unknown_priorities += 1
        for i in assignee_cols:
            if i < len(row) and row[i].strip():
                assignee_values += 1
                break

        key = cell(row, "key")
        subject = f"[{key}] {summary}" if key else summary
        payload = {
            "subject": subject[:255],
            "description": cell(row, "description") or None,
            "type": TYPE_MAP.get(raw_type.lower(), "task") if raw_type else "task",
            "status": STATUS_MAP.get(raw_status.lower(), "backlog") if raw_status else "backlog",
            "priority": PRIORITY_MAP.get(raw_priority.lower(), "none") if raw_priority else "none",
            "start_date": None,
            "due_date": due,
            "estimated_hours": None,
        }
        result.rows.append((row_number, payload, None, raw))

    if assignee_values:
        result.notes.append(
            f"Assignee/Reporter 값 {assignee_values}건은 매핑되지 않았습니다(계정 매칭 불가)."
        )
    if unknown_types:
        result.notes.append(f"알 수 없는 Issue Type {unknown_types}건은 'task'로 가져왔습니다.")
    if unknown_priorities:
        result.notes.append(
            f"알 수 없는 Priority {unknown_priorities}건은 '없음'으로 가져왔습니다."
        )
    if ignored:
        result.notes.append("무시된 열: " + ", ".join(sorted(set(ignored))))
    return result


# --- Linear CSV adapter (Pass 25 PR-AQ) -------------------------------------
# Same frame and result shape as the Jira adapter above (JiraMapResult is
# consumed unchanged — v25.1 R1-②). Linear's official export has fixed columns;
# custom statuses outside the standard six isolate their row (R1-③), and
# Estimate is a POINT scale — semantically different from hours, so it is never
# injected, only counted in notes (R1-⑥).

_L_TITLE = "title"
_L_DESCRIPTION = "description"
_L_STATUS = "status"
_L_PRIORITY = "priority"
_L_DUE = ("due date", "duedate")
_L_ID = "id"
_L_PEOPLE = ("assignee", "creator")
_L_ESTIMATE = "estimate"

LINEAR_STATUS_MAP = {
    "backlog": "backlog",
    "todo": "todo",
    "in progress": "in_progress",
    "in review": "in_review",
    "done": "done",
    "canceled": "cancelled",
    "cancelled": "cancelled",
}

LINEAR_PRIORITY_MAP = {
    "urgent": "urgent",
    "high": "high",
    "medium": "medium",
    "low": "low",
    "no priority": "none",
}


def map_linear_csv(content: str) -> JiraMapResult:
    result = JiraMapResult()
    reader = csv.reader(io.StringIO(content))
    try:
        header = next(reader)
    except (StopIteration, csv.Error):
        result.header_error = "CSV is empty"
        return result

    lowered = [h.lstrip("\ufeff").strip().lower() for h in header]
    idx: dict[str, int] = {}
    ignored: list[str] = []
    people_cols: list[int] = []
    estimate_col: int | None = None
    for i, name in enumerate(lowered):
        if name == _L_TITLE and "title" not in idx:
            idx["title"] = i
        elif name == _L_DESCRIPTION and "description" not in idx:
            idx["description"] = i
        elif name == _L_STATUS and "status" not in idx:
            idx["status"] = i
        elif name == _L_PRIORITY and "priority" not in idx:
            idx["priority"] = i
        elif name in _L_DUE and "due" not in idx:
            idx["due"] = i
        elif name == _L_ID and "id" not in idx:
            idx["id"] = i
        elif name in _L_PEOPLE:
            people_cols.append(i)
        elif name == _L_ESTIMATE and estimate_col is None:
            estimate_col = i
        else:
            ignored.append(header[i].strip() or "(빈 헤더)")

    if "title" not in idx:
        result.header_error = "Linear CSV header must include a 'Title' column"
        return result

    unknown_priorities = 0
    people_values = 0
    estimates_skipped = 0
    row_number = 0

    def cell(row: list[str], key: str) -> str:
        i = idx.get(key)
        return row[i].strip() if i is not None and i < len(row) else ""

    try:
        rows = list(reader)
    except csv.Error:
        result.header_error = "malformed CSV"
        return result

    for row in rows:
        if not any(c.strip() for c in row):
            continue
        row_number += 1
        raw = ",".join(row)

        title = cell(row, "title")
        if not title:
            result.rows.append((row_number, None, "Title: 값이 비어 있습니다", raw))
            continue

        raw_status = cell(row, "status")
        if raw_status and raw_status.lower() not in LINEAR_STATUS_MAP:
            # Custom Linear statuses isolate — a wrong status corrupts progress.
            result.rows.append((row_number, None, f"Status: 매핑할 수 없는 값 '{raw_status}'", raw))
            continue

        raw_due = cell(row, "due")
        due: str | None = None
        if raw_due:
            try:
                due = date.fromisoformat(raw_due).isoformat()
            except ValueError:
                result.rows.append(
                    (row_number, None, f"Due Date: 지원하지 않는 형식 '{raw_due}'", raw)
                )
                continue

        raw_priority = cell(row, "priority")
        if raw_priority and raw_priority.lower() not in LINEAR_PRIORITY_MAP:
            unknown_priorities += 1
        for i in people_cols:
            if i < len(row) and row[i].strip():
                people_values += 1
                break
        if estimate_col is not None and estimate_col < len(row) and row[estimate_col].strip():
            estimates_skipped += 1  # point scale ≠ hours — never injected (R1-⑥)

        identifier = cell(row, "id")
        subject = f"[{identifier}] {title}" if identifier else title
        payload = {
            "subject": subject[:255],
            "description": cell(row, "description") or None,
            "type": "task",  # Linear export has no type column — documented
            "status": (
                LINEAR_STATUS_MAP.get(raw_status.lower(), "backlog") if raw_status else "backlog"
            ),
            "priority": (
                LINEAR_PRIORITY_MAP.get(raw_priority.lower(), "none") if raw_priority else "none"
            ),
            "start_date": None,
            "due_date": due,
            "estimated_hours": None,
        }
        result.rows.append((row_number, payload, None, raw))

    if people_values:
        result.notes.append(
            f"Assignee/Creator 값 {people_values}건은 매핑되지 않았습니다(계정 매칭 불가)."
        )
    if unknown_priorities:
        result.notes.append(
            f"알 수 없는 Priority {unknown_priorities}건은 '없음'으로 가져왔습니다."
        )
    if estimates_skipped:
        result.notes.append(
            f"Estimate {estimates_skipped}건은 포인트 단위라 시간으로 넣지 않았습니다."
        )
    if ignored:
        result.notes.append("무시된 열: " + ", ".join(sorted(set(ignored))))
    return result
