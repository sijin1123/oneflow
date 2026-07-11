"""Permission registry — the fixed role matrix, documented (Pass 62 PR-CA).

This is a DOCUMENTATION registry, not an enforcement point: enforcement stays
in require_role/require_member/require_writer at each endpoint (unchanged).
Two pytest layers keep it honest (v62.1 R1-③):
  (a) accuracy — representative verbs are exercised per role and must match
      the declared value, including the author/non-author conditional split;
  (b) coverage — every mutating /api/v1 route in the OpenAPI schema must be
      mapped to a verb here or listed in ENDPOINT_ALLOWLIST, so a new write
      endpoint that skips the report fails CI.

Values are the three-state model: 'always' | 'never' | 'conditional' —
'conditional' rows carry a human condition string (v62.1 R1-①). The workspace
admin axis (is_admin) is deliberately NOT a column: it never grants project
verbs (Pass 33 invariant) and is called out in the report's note instead.
"""

ALWAYS = "always"
NEVER = "never"
CONDITIONAL = "conditional"

# Rows of the project permission report, in display order.
# key → (label, owner, member, viewer, condition, note)
PERMISSION_MATRIX: list[dict[str, str | None]] = [
    {
        "key": "project.manage",
        "label": "프로젝트 설정·아카이브/복원",
        "owner": ALWAYS,
        "member": NEVER,
        "viewer": NEVER,
        "condition": None,
        "note": None,
    },
    {
        "key": "member.manage",
        "label": "멤버 추가·역할 변경·제거",
        "owner": ALWAYS,
        "member": NEVER,
        "viewer": NEVER,
        "condition": None,
        "note": "소유자는 항상 1명 이상 유지됩니다.",
    },
    {
        "key": "status.manage",
        "label": "상태 워크플로우 구성",
        "owner": ALWAYS,
        "member": NEVER,
        "viewer": NEVER,
        "condition": None,
        "note": None,
    },
    {
        "key": "project_type.manage",
        "label": "작업 타입 구성",
        "owner": ALWAYS,
        "member": NEVER,
        "viewer": NEVER,
        "condition": None,
        "note": None,
    },
    {
        "key": "field.manage",
        "label": "커스텀 필드 구성",
        "owner": ALWAYS,
        "member": NEVER,
        "viewer": NEVER,
        "condition": None,
        "note": None,
    },
    {
        "key": "cycle.manage",
        "label": "사이클 관리",
        "owner": ALWAYS,
        "member": NEVER,
        "viewer": NEVER,
        "condition": None,
        "note": None,
    },
    {
        "key": "module.manage",
        "label": "모듈 관리",
        "owner": ALWAYS,
        "member": NEVER,
        "viewer": NEVER,
        "condition": None,
        "note": None,
    },
    {
        "key": "automation.manage",
        "label": "자동화 규칙 관리",
        "owner": ALWAYS,
        "member": NEVER,
        "viewer": NEVER,
        "condition": None,
        "note": None,
    },
    {
        "key": "intake.triage",
        "label": "인테이크 판정(수락/반려)",
        "owner": ALWAYS,
        "member": NEVER,
        "viewer": NEVER,
        "condition": None,
        "note": None,
    },
    {
        "key": "work.move",
        "label": "작업을 다른 프로젝트로 이동",
        "owner": ALWAYS,
        "member": NEVER,
        "viewer": NEVER,
        "condition": None,
        "note": "출발 프로젝트 소유자만. 대상 프로젝트에서는 쓰기 멤버여야 합니다.",
    },
    {
        "key": "work.write",
        "label": "작업 생성·수정·코멘트·시간/비용 기록·첨부·워처",
        "owner": ALWAYS,
        "member": ALWAYS,
        "viewer": NEVER,
        "condition": None,
        "note": "뷰어는 배정 대상도 될 수 없습니다.",
    },
    {
        "key": "milestone.write",
        "label": "마일스톤 관리",
        "owner": ALWAYS,
        "member": ALWAYS,
        "viewer": NEVER,
        "condition": None,
        "note": None,
    },
    {
        "key": "meeting.write",
        "label": "회의·액션 아이템·아젠다 템플릿",
        "owner": ALWAYS,
        "member": ALWAYS,
        "viewer": NEVER,
        "condition": None,
        "note": None,
    },
    {
        "key": "document.write",
        "label": "문서 생성·수정·삭제·작업 연결",
        "owner": ALWAYS,
        "member": ALWAYS,
        "viewer": NEVER,
        "condition": None,
        "note": None,
    },
    {
        "key": "intake.submit",
        "label": "인테이크 항목 제출",
        "owner": ALWAYS,
        "member": ALWAYS,
        "viewer": NEVER,
        "condition": None,
        "note": None,
    },
    {
        "key": "entry.delete",
        "label": "시간/비용 항목 삭제",
        "owner": ALWAYS,
        "member": CONDITIONAL,
        "viewer": NEVER,
        "condition": "본인이 기록한 항목만",
        "note": None,
    },
    {
        "key": "authored.delete",
        "label": "문서 코멘트·회의 템플릿 삭제",
        "owner": ALWAYS,
        "member": CONDITIONAL,
        "viewer": NEVER,
        "condition": "본인이 작성한 것만",
        "note": None,
    },
    {
        "key": "saved_filter.write",
        "label": "저장 뷰 만들기",
        "owner": ALWAYS,
        "member": ALWAYS,
        "viewer": NEVER,
        "condition": None,
        "note": None,
    },
    {
        "key": "saved_filter.edit",
        "label": "저장 뷰 수정·삭제",
        "owner": CONDITIONAL,
        "member": CONDITIONAL,
        "viewer": NEVER,
        "condition": "작성자 본인만 (소유자도 남의 뷰는 불가)",
        "note": None,
    },
    {
        "key": "dashboard.layout",
        "label": "개인 대시보드 레이아웃",
        "owner": ALWAYS,
        "member": ALWAYS,
        "viewer": ALWAYS,
        "condition": None,
        "note": "개인 표시 설정 — 프로젝트 데이터를 바꾸지 않아 뷰어·아카이브에서도 허용.",
    },
]

VERB_KEYS = {row["key"] for row in PERMISSION_MATRIX}

# Every mutating "METHOD path" (OpenAPI template path) must appear here or in
# ENDPOINT_ALLOWLIST — the coverage pytest enforces it.
ENDPOINT_VERBS: dict[str, str] = {
    # project.manage
    "PATCH /api/v1/projects/{project_id}": "project.manage",
    "POST /api/v1/projects/{project_id}/archive": "project.manage",
    "POST /api/v1/projects/{project_id}/unarchive": "project.manage",
    # member.manage
    "POST /api/v1/projects/{project_id}/members": "member.manage",
    "PATCH /api/v1/projects/{project_id}/members/{user_id}": "member.manage",
    "DELETE /api/v1/projects/{project_id}/members/{user_id}": "member.manage",
    # status.manage / project_type.manage / field.manage
    "PATCH /api/v1/projects/{project_id}/statuses/{status_id}": "status.manage",
    "PUT /api/v1/projects/{project_id}/statuses/order": "status.manage",
    "PATCH /api/v1/projects/{project_id}/types/{type_id}": "project_type.manage",
    "PUT /api/v1/projects/{project_id}/types/order": "project_type.manage",
    "POST /api/v1/projects/{project_id}/custom-fields": "field.manage",
    "PATCH /api/v1/projects/{project_id}/custom-fields/{field_id}": "field.manage",
    "DELETE /api/v1/projects/{project_id}/custom-fields/{field_id}": "field.manage",
    "PUT /api/v1/projects/{project_id}/custom-fields/order": "field.manage",
    # cycle.manage / module.manage / automation.manage / intake.triage
    "POST /api/v1/projects/{project_id}/cycles": "cycle.manage",
    "PATCH /api/v1/projects/{project_id}/cycles/{cycle_id}": "cycle.manage",
    "DELETE /api/v1/projects/{project_id}/cycles/{cycle_id}": "cycle.manage",
    "POST /api/v1/projects/{project_id}/cycles/{cycle_id}/rollover": "cycle.manage",
    "POST /api/v1/projects/{project_id}/modules": "module.manage",
    "PATCH /api/v1/projects/{project_id}/modules/{module_id}": "module.manage",
    "DELETE /api/v1/projects/{project_id}/modules/{module_id}": "module.manage",
    "PUT /api/v1/projects/{project_id}/modules/{module_id}/members": "module.manage",
    "POST /api/v1/projects/{project_id}/automation-rules": "automation.manage",
    "PATCH /api/v1/projects/{project_id}/automation-rules/{rule_id}": "automation.manage",
    "DELETE /api/v1/projects/{project_id}/automation-rules/{rule_id}": "automation.manage",
    "PUT /api/v1/projects/{project_id}/automation-rules/order": "automation.manage",
    "POST /api/v1/projects/{project_id}/intake/{item_id}/triage": "intake.triage",
    # work.write
    "POST /api/v1/projects/{project_id}/work-packages": "work.write",
    "POST /api/v1/projects/{project_id}/work-item-drafts": "work.write",
    "PUT /api/v1/work-item-drafts/{draft_id}": "work.write",
    "POST /api/v1/work-item-drafts/{draft_id}/submit": "work.write",
    "PATCH /api/v1/work-packages/{wp_id}": "work.write",
    "POST /api/v1/projects/{project_id}/work-packages/bulk-update": "work.write",
    "POST /api/v1/work-packages/{wp_id}/duplicate": "work.write",
    "POST /api/v1/work-packages/{wp_id}/move": "work.move",
    "POST /api/v1/projects/{project_id}/work-packages/import": "work.write",
    "POST /api/v1/projects/{project_id}/work-packages/import/jira": "work.write",
    "POST /api/v1/projects/{project_id}/work-packages/import/linear": "work.write",
    "PUT /api/v1/work-packages/{wp_id}/custom-values": "work.write",
    "POST /api/v1/work-packages/{wp_id}/relations": "work.write",
    "DELETE /api/v1/work-packages/{wp_id}/relations/{relation_id}": "work.write",
    "PUT /api/v1/work-packages/{wp_id}/watchers/me": "work.write",
    "DELETE /api/v1/work-packages/{wp_id}/watchers/me": "work.write",
    "POST /api/v1/work-packages/{wp_id}/comments": "work.write",
    "PUT /api/v1/comments/{comment_id}/reactions/{emoji}": "work.write",
    "DELETE /api/v1/comments/{comment_id}/reactions/{emoji}": "work.write",
    "POST /api/v1/work-packages/{wp_id}/time-entries": "work.write",
    "POST /api/v1/work-packages/{wp_id}/cost-entries": "work.write",
    "POST /api/v1/projects/{project_id}/attachments": "work.write",
    "POST /api/v1/projects/{project_id}/attachments/upload": "work.write",
    "DELETE /api/v1/attachments/{attachment_id}": "work.write",
    # milestone.write
    "POST /api/v1/projects/{project_id}/milestones": "milestone.write",
    "PATCH /api/v1/projects/{project_id}/milestones/{milestone_id}": "milestone.write",
    "DELETE /api/v1/projects/{project_id}/milestones/{milestone_id}": "milestone.write",
    # meeting.write
    "POST /api/v1/projects/{project_id}/meetings": "meeting.write",
    "PATCH /api/v1/meetings/{meeting_id}": "meeting.write",
    "DELETE /api/v1/meetings/{meeting_id}": "meeting.write",
    "POST /api/v1/meetings/{meeting_id}/follow-up": "meeting.write",
    "POST /api/v1/meetings/{meeting_id}/action-items": "meeting.write",
    "PATCH /api/v1/action-items/{item_id}": "meeting.write",
    "DELETE /api/v1/action-items/{item_id}": "meeting.write",
    "POST /api/v1/action-items/{item_id}/convert": "meeting.write",
    "POST /api/v1/projects/{project_id}/meeting-templates": "meeting.write",
    # document.write
    "POST /api/v1/projects/{project_id}/documents": "document.write",
    "PATCH /api/v1/documents/{doc_id}": "document.write",
    "DELETE /api/v1/documents/{doc_id}": "document.write",
    "POST /api/v1/documents/{doc_id}/comments": "document.write",
    "POST /api/v1/documents/{doc_id}/work-package-links": "document.write",
    "DELETE /api/v1/documents/{doc_id}/work-package-links/{link_id}": "document.write",
    # intake.submit
    "POST /api/v1/projects/{project_id}/intake": "intake.submit",
    # conditional deletes
    "DELETE /api/v1/work-packages/{wp_id}/time-entries/{entry_id}": "entry.delete",
    "DELETE /api/v1/work-packages/{wp_id}/cost-entries/{entry_id}": "entry.delete",
    "DELETE /api/v1/document-comments/{comment_id}": "authored.delete",
    "DELETE /api/v1/meeting-templates/{template_id}": "authored.delete",
    # saved filters
    "POST /api/v1/projects/{project_id}/saved-filters": "saved_filter.write",
    "PATCH /api/v1/projects/{project_id}/saved-filters/{filter_id}": "saved_filter.edit",
    "DELETE /api/v1/projects/{project_id}/saved-filters/{filter_id}": "saved_filter.edit",
    # personal-preference exception
    "PUT /api/v1/projects/{project_id}/dashboard/layout": "dashboard.layout",
}

# Mutating routes that are deliberately OUTSIDE the project role matrix.
# route → reason (kept human-readable; the coverage test only checks presence).
ENDPOINT_ALLOWLIST: dict[str, str] = {
    "POST /api/v1/projects": "워크스페이스 — 모든 활성 사용자가 프로젝트를 만들 수 있음",
    "PATCH /api/v1/admin/workspace/features/wiki": "워크스페이스 admin 기능 정책 — is_admin 전용",
    "POST /api/v1/project-templates": "워크스페이스 템플릿 — 생성자 또는 활성 admin 관리",
    "POST /api/v1/project-templates/{template_id}/revisions": (
        "워크스페이스 템플릿 — 생성자 또는 활성 admin 관리"
    ),
    "POST /api/v1/project-templates/{template_id}/archive": (
        "워크스페이스 템플릿 — 생성자 또는 활성 admin 관리"
    ),
    "POST /api/v1/project-templates/{template_id}/unarchive": (
        "워크스페이스 템플릿 — 생성자 또는 활성 admin 관리"
    ),
    "DELETE /api/v1/project-templates/{template_id}": (
        "워크스페이스 템플릿 — 생성자 또는 활성 admin 관리"
    ),
    "POST /api/v1/project-templates/{template_id}/apply": (
        "워크스페이스 템플릿 적용 — 프로젝트 생성 권한 필요"
    ),
    "POST /api/v1/auth/login": "인증 축 — dev 로그인(loopback 한정, 프로젝트 verb 아님)",
    "POST /api/v1/auth/logout": "인증 축 — 세션 폐기(비인증·멱등)",
    "POST /api/v1/users": "워크스페이스 admin 축 (is_admin — 프로젝트 역할과 별개)",
    "PATCH /api/v1/users/{user_id}": "워크스페이스 admin 축 (is_admin — 프로젝트 역할과 별개)",
    "POST /api/v1/me/notifications/read-all": "개인 알림 — 사용자 스코프",
    "POST /api/v1/me/notifications/{notification_id}/read": "개인 알림 — 사용자 스코프",
    "POST /api/v1/me/personal-notes": "개인 메모 — 사용자 스코프",
    "PATCH /api/v1/me/personal-notes/{note_id}": "개인 메모 — 사용자 스코프",
    "PUT /api/v1/me/personal-notes/order": "개인 메모 순서 — 사용자 스코프",
    "DELETE /api/v1/me/personal-notes/{note_id}": "개인 메모 — 사용자 스코프",
    "DELETE /api/v1/work-item-drafts/{draft_id}": (
        "개인 초안 정리 — 프로젝트 멤버십 상실 뒤에도 소유자만 삭제 가능"
    ),
    "PUT /api/v1/me/notification-settings": "개인 알림 설정 — 사용자 스코프",
    "POST /api/v1/me/access-tokens": "개인 개발자 토큰 — 사용자 스코프",
    "DELETE /api/v1/me/access-tokens/{token_id}": "개인 개발자 토큰 폐기 — 사용자 스코프",
    "POST /api/v1/webhooks": "워크스페이스 admin webhook endpoint 생성",
    "PATCH /api/v1/webhooks/{endpoint_id}": "워크스페이스 admin webhook endpoint 수정",
    "DELETE /api/v1/webhooks/{endpoint_id}": "워크스페이스 admin webhook endpoint 폐기",
    "POST /api/v1/webhooks/{endpoint_id}/rotate-secret": "워크스페이스 admin signing secret 회전",
    "POST /api/v1/webhooks/{endpoint_id}/test": "워크스페이스 admin test delivery",
    "POST /api/v1/webhook-deliveries/{delivery_id}/retry": "워크스페이스 admin delivery 재시도",
    "POST /api/v1/initiatives": "워크스페이스 리소스 — creator-only 축",
    "PATCH /api/v1/initiatives/{initiative_id}": "워크스페이스 리소스 — creator-only 축",
    "DELETE /api/v1/initiatives/{initiative_id}": "워크스페이스 리소스 — creator-only 축",
    "POST /api/v1/initiatives/{initiative_id}/projects": "워크스페이스 리소스 — creator-only 축",
    "DELETE /api/v1/initiatives/{initiative_id}/projects/{project_id}": (
        "워크스페이스 리소스 — creator-only 축"
    ),
    "POST /api/v1/work-packages/{wp_id}/summary": (
        "읽기 전용 계산(AI 요약) — 데이터 무변경, 멤버 read 스코프(뷰어 포함)"
    ),
}
