"""Work-package summary provider (PLAN §3 Phase 3 AI/RAG).

Deliberately NOT overbuilt: a local, deterministic, secret-free extractive summary
behind a single function seam. A real LLM/RAG provider can replace
`summarize_work_package` later without changing the endpoint or the feature flag.
"""

import re

from app.models.work_package import WorkPackage

_TAG_RE = re.compile(r"<[^>]+>")

_STATUS_KO = {
    "backlog": "백로그",
    "todo": "할 일",
    "in_progress": "진행 중",
    "in_review": "검토 중",
    "done": "완료",
    "cancelled": "취소",
}
_PRIORITY_KO = {
    "none": "없음",
    "low": "낮음",
    "medium": "보통",
    "high": "높음",
    "urgent": "긴급",
}
_TYPE_KO = {"task": "작업", "bug": "버그", "feature": "기능", "milestone": "마일스톤"}

PROVIDER = "local-extractive"


def summarize_work_package(wp: WorkPackage, comment_count: int, activity_count: int) -> str:
    """Build a short Korean summary from a work package and its engagement counts."""
    status = _STATUS_KO.get(wp.status, wp.status)
    priority = _PRIORITY_KO.get(wp.priority, wp.priority)
    kind = _TYPE_KO.get(wp.type, wp.type)

    parts = [
        f"'{wp.subject}'은(는) 유형 '{kind}', 상태 '{status}', 우선순위 '{priority}'인 작업입니다.",
    ]
    if wp.start_date and wp.due_date:
        parts.append(f"일정은 {wp.start_date}부터 {wp.due_date}까지입니다.")
    elif wp.due_date:
        parts.append(f"기한은 {wp.due_date}입니다.")
    if wp.estimated_hours is not None:
        parts.append(f"예상 소요 시간은 {wp.estimated_hours}시간입니다.")
    parts.append(f"코멘트 {comment_count}건과 활동 이력 {activity_count}건이 기록되어 있습니다.")
    if wp.description:
        # Description may be sanitized rich-text HTML — strip tags for the summary.
        desc = " ".join(_TAG_RE.sub(" ", wp.description).split())
        if desc:
            if len(desc) > 200:
                desc = desc[:200] + "…"
            parts.append(f"설명 요약: {desc}")

    return " ".join(parts)
