# OneFlow — fable5 전수 검사 핸드오프 프롬프트

> 작성: 2026-07-05 · 작성 모델: Opus 4.8 (개발 담당) · 대상 실행 모델: **fable5 전용**
> 상태: **사용자 승인 대기**. 이 문서는 승인 즉시 fable5 세션에서 붙여넣어 실행할 수 있는 준비 산출물이다.

## 0. 이 문서의 성격 (반드시 먼저 읽기)

- OneFlow 그린필드 목표(`docs/goals/ONEFLOW_GREENFIELD_GOAL.md`)의 **모든 개발 항목**(Phase 1/2/3 + Phase 1 후속 + 후속 협업 모듈)이 Opus 4.8에 의해 구현·검증·머지 완료되었다(개발 PR #1~#26, 핸드오프/검증 문서 PR #27~#28).
- 목표 규약상 **전수 검사는 실제 fable5 세션에서만** 수행한다. Opus 4.8을 포함한 다른 모델은 검사를 수행·흉내 내지 않는다.
- 전수 검사는 **릴리스 차단(release-blocking) 마무리 패스**이다. fable5가 전체 코드베이스를 검사하고, 명시 후속 2개를 제외한 부족분을 필수 지적으로 분류해 수정·재검증하기 전에는 목표를 최종 완료로 보고하지 않는다.
- **시작 조건**: (1) 사용자가 `Phase 3 개발과 검증/머지가 완료되었습니다. fable5 전수 검사를 시작할까요?`에 명시 승인, (2) active model = fable5 확인. 둘 중 하나라도 미충족 시 검사 착수 금지.

## 1. 현재 상태 스냅샷 (검사 대상 baseline)

| 항목 | 값 |
|---|---|
| Repo | `https://github.com/sijin1123/oneflow.git` |
| 기본 브랜치 | `main` (검사 착수 시점 HEAD 재측정 필수) |
| 누적 PR | #1 ~ #28 (전부 CI green 머지; #1~#26 개발, #27 fable5 핸드오프, #28 검증 문서) |
| 마이그레이션 | `alembic/versions/0001` ~ `0013` (13개) |
| 백엔드 | FastAPI + SQLAlchemy 2 async + asyncpg + Alembic + Pydantic v2 (uv, Python 3.13) |
| 프론트 | React 19 + Vite 8 + React Router v7 + TanStack Query v5 + Tailwind v4 + Tiptap + oxlint (Node 24) |
| DB | PostgreSQL 17 (로컬 Docker Compose) |
| 테스트 | 백엔드 pytest 164 · 프론트 node:test 13 · vitest 4 · Playwright e2e 23 |
| CI | 4 잡(backend, frontend, cleanroom, security-audit) — 앞 3개가 필수 머지 체크 |

### 구현된 기능 인벤토리 (검사 범위)

- **코어**: 프로젝트 CRU, 워크패키지 CRUD(낙관적 동시성 `version` + 단일 원자적 조건부 UPDATE), 멤버십/역할 인가(owner/member, 비멤버 404·비소유자 403), 관계(blocks/precedes/follows/relates, 동일 프로젝트 DB 불변식), 계층(parent_id, 순환/동일프로젝트 가드).
- **뷰**: 목록(필터·검색·정렬 제목순 ICU)·보드(구성형 상태 컬럼)·계층 트리·타임라인(경량)·캘린더·대시보드(KPI·분포·롤업).
- **협업**: 코멘트/활동 이력, 배정 알림+인박스, 프로젝트 감사 로그, 문서/위키, 회의(안건/회의록/액션 아이템), 파일(첨부 메타데이터).
- **계획/일정**: 마일스톤, CSV 내보내기/가져오기(dry-run·대사·실패행 격리), 저장 필터, 크로스 프로젝트 검색.
- **엔터프라이즈**: 시간추적, 비용/예산, 워크플로우 커스터마이징(구성형 상태 라벨/순서), 자동화 규칙 엔진(status→priority), AI 요약(feature-flag `ONEFLOW_AI_SUMMARY`, 로컬 provider).
- **보안/계약**: nh3 서버 HTML 새니타이즈, dev 루프백 가드, 시드 다층 파괴 가드, OpenAPI 타입 생성 + 계약 드리프트 게이트, 클린룸 게이트, 의존성 감사 CI.

## 2. 전수 검사 범위 (목표 §9/§14 지정 — 전 영역)

backend · frontend · database/migrations · auth/permissions · workflow rules · timeline/Gantt · time/cost · dashboards/reports · settings · API contracts · tests · CI · environment variables · security · accessibility · performance · clean-room/license compliance · documentation · worklog consistency.

각 영역에서 최소 다음을 확인한다.

1. **정확성/버그**: 경계값·null 의미론·동시성(원자적 UPDATE, advisory lock)·트랜잭션 원자성(활동/알림/자동화 동일 트랜잭션)·409 계약 일관성.
2. **보안**: 인가 경계(존재 은닉 404 vs 403), XSS(nh3 허용목록 우회 가능성), URL 스킴 검증(첨부), SQL/LIKE 이스케이프, 시크릿 미커밋, dev 인증 노출 경계, 파괴적 리셋 가드.
3. **DB/마이그레이션**: 0001~0013 up/down 무결성, FK ondelete 정책, 인덱스 적정성, ICU 콜레이션·JSONB·복합 FK 불변식.
4. **계약/타입**: OpenAPI ↔ `@oneflow/shared` 드리프트, 프론트 계약 assertion 커버리지.
5. **테스트/CI**: 커버리지 공백(특히 자동화 루프·낙관적 동시성 경합·권한 매트릭스), pytest-randomly 안정성, e2e 결정성(클럭 고정 등), 필수 체크 구성.
6. **접근성/성능**: 키보드/aria, 번들 크기(Tiptap 코드스플릿 유지), N+1 쿼리(회의 액션아이템 임베드·대시보드 롤업).
7. **클린룸/라이선스**: `@plane/*` 미사용, GPL/AGPL 미상속, 신규 의존성(nh3·Tiptap·vitest·RTL·jsdom) 라이선스, 브랜딩/트레이드드레스.
8. **문서/워크로그**: `docs/PROJECT_WORKLOG.md`·`oneflow/docs/VERIFICATION.md`·`ONEFLOW_CLEANROOM_NOTES.md` 일치성.

## 3. 명시 후속과 마무리 구현 정책

fable5는 단순 리뷰가 아니라 **전수 검사 + 부족분 마무리 구현 패스**를 수행한다.

### 3.1 명시 후속으로 남기는 항목 (미구현 자체를 결함으로 보지 않음)

| 항목 | 처리 |
|---|---|
| 실시간 협업(Yjs/WebSocket) | 최종 후속. 현재 문서/회의/위키의 일반 CRUD·낙관적 동시성·XSS 경계는 검사하되, Google Docs/Notion식 실시간 다중 편집 미구현 자체는 결함으로 지적하지 않는다. |
| UUIDv7 전환 | 최종 후속. 현재 UUID/FK/인덱스/마이그레이션 무결성은 검사하되, UUIDv7 미전환 자체는 결함으로 지적하지 않는다. |

위 2개를 제외한 나머지는 "이미 알려진 이연"으로 면제하지 않는다.

### 3.2 fable5가 부족하면 마무리해야 하는 항목

아래 항목은 현재 기초 구현 또는 대체 구현이 있으므로, fable5가 실사용 기준으로 부족하다고 판단하면 **필수 지적 → 보완 구현 → 테스트 추가/갱신 → 재검증 → PR → CI 확인 → 머지**까지 진행한다.

| 영역 | 현재 상태 | fable5 마무리 기준 |
|---|---|---|
| 파일 저장소 | 첨부 메타데이터와 외부 URL 기반 파일 페이지 구현 | URL 검증·권한·삭제·연결성이 부족하면 보완. 실 바이너리 업로드/다운로드까지 제품 완성에 필수라고 판단되면 최소 안전 구현 또는 명확한 스토리지 인터페이스/설정/테스트까지 구현한다. |
| AI/RAG | `ONEFLOW_AI_SUMMARY` feature flag와 로컬 provider 기반 요약 구현 | provider abstraction, flag OFF/ON, 실패 처리, 비밀값 분리, 설정 문서, 테스트가 부족하면 보완한다. 실 외부 LLM 연결이 필요하다고 판단되면 비밀값 노출 없이 env 기반 안전 배선과 테스트 더블을 구현한다. |
| Gantt/Timeline | 경량 타임라인, 관계, 마일스톤, 캘린더 구현 | 실사용 기준으로 일정/의존성/마일스톤 표시가 부족하면 안전한 범위에서 보완한다. 라이선스 불명/GPL/AGPL 의존성은 금지한다. |
| 워크플로우 | 구성형 상태 라벨/순서와 동적 보드 구현 | 상태 추가/비활성화/전이 규칙 등 최소 운영 기능이 필요하다고 판단되면 스키마·API·UI·테스트를 보완한다. |
| 레거시/CSV import | CSV import/export(dry-run·대사·실패행 격리) 구현 | 실제 전환 리허설에 필요한 매핑, 검증, 오류 보고, 재처리 문서/코드가 부족하면 보완한다. |
| 문서/회의/파일 업무 흐름 | 문서, 회의, 액션 아이템, 파일 메타데이터 구현 | 검색, 권한, 워크패키지 연결, 사용성, XSS/권한 경계가 부족하면 보완한다. |
| 운영/설정/보고 | 설정, 대시보드, 리포트, 감사로그, 자동화 구현 | 관리자가 실제로 운영하기에 부족한 표시/검증/설정 저장/감사 추적이 있으면 보완한다. |

정리: fable5는 위 3.1의 두 항목만 "명시 후속"으로 인정하고, 나머지는 검사 중 부족하면 마무리 구현 대상이다.

## 4. fable5 운영 규칙 (필수 지적 처리)

목표 §10 준수:

1. 필수 지적은 **수정 → 테스트 추가/갱신 → 재검증 → 커밋 → PR → CI 확인 → 머지**까지 진행.
2. 수정 PR은 검증이 green/clean이면 **추가 사용자 승인 없이** 머지(2026-07-05 사전 승인 범위).
3. 기본 브랜치 직접 커밋/push 금지 — 항상 branch → PR → 검증 → merge.
4. 작은 브랜치·작은 PR·작은 커밋 유지. 하나의 PR에 하나의 목적.
5. 검증 실패 상태로 PR 생성/완료 보고 금지.
6. 산출물: **fable5 감사 리포트 + 수정 로그**를 `oneflow/docs/`(예: `FABLE5_AUDIT_REPORT.md`)에 기록하고, `docs/PROJECT_WORKLOG.md`(B-018) 갱신, 재검증 결과·머지 PR 링크 포함.

## 5. 검증 명령 (로컬 재현)

```bash
# 백엔드 (uv, PostgreSQL 필요)
cd apps/api
uv run ruff format --check . && uv run ruff check .
uv run pytest -q
# 마이그레이션 up/down/up 스모크 (dev DB oneflow 초기화됨)
cd ../.. && make api-migrate-smoke

# OpenAPI 타입 재생성 + 드리프트 게이트
bash scripts/gen-openapi-types.sh
bash scripts/check-openapi-types.sh

# 프론트
cd apps/web
npm run typecheck && npm run lint
npm run test:unit          # node:test 순수함수
npm run test:component     # vitest + Testing Library
npm run build
npm run test:e2e           # Playwright (자체 dev 서버 기동)

# 클린룸 게이트
cd ../.. && bash scripts/check_cleanroom.sh
```

## 6. fable5 세션 착수 프롬프트 (복사용)

```text
당신은 fable5 세션입니다. OneFlow 그린필드 목표(docs/goals/ONEFLOW_GREENFIELD_GOAL.md)의 전 개발 항목이 Opus 4.8에 의해 구현·머지 완료되었습니다(main, 개발 PR #1~#26, 문서/검증 PR #27~#28, 마이그레이션 0001~0013). 이제 릴리스 차단 전수 검사와 부족분 마무리 구현 패스를 수행하세요.

0. 먼저 active model이 fable5임을 확인하고, main HEAD·CI·PR 상태를 재측정하세요. fable5가 아니면 검사를 수행하지 말고 그 사실을 보고하세요.
1. docs/FABLE5_INSPECTION_HANDOFF.md의 §2 전 영역(backend, frontend, DB/migrations, auth/permissions, workflow, timeline/Gantt, time/cost, dashboard/report, settings, API contract, tests, CI, env/secrets, security, accessibility, performance, clean-room/license, docs, worklog)을 검사하세요.
2. §3.1의 명시 후속 2개(실시간 협업, UUIDv7 전환)만 미구현 자체를 결함으로 보지 마세요. 그 외 부족분은 제외하지 말고 §3.2 기준으로 필수 지적 또는 마무리 구현 대상으로 분류하세요.
3. 필수 지적과 마무리 구현 대상은 수정 → 테스트 추가/갱신 → 재검증 → 커밋 → PR → CI green 확인 → 머지까지 진행하세요(§4). 기본 브랜치 직접 커밋 금지, 작은 PR 유지, 검증 실패 상태 PR 금지.
4. §5 명령으로 재현·재검증하세요. 신규/변경 로직은 반드시 테스트를 동반하세요.
5. 감사 리포트와 수정 로그를 oneflow/docs/FABLE5_AUDIT_REPORT.md에 기록하고, docs/PROJECT_WORKLOG.md(B-018)를 갱신하세요(재검증 결과·머지 PR 링크 포함).
6. 모든 필수 수정 머지·재검증 green 후에만 목표 최종 완료를 보고하세요.
```

## 7. 완료 정의 (목표 최종 완료 조건)

- Phase 1/2/3 + 후속 모듈 구현·머지 완료 ✅ (본 시점 충족)
- 사용자 fable5 승인 ⬜
- active model = fable5 확인 ⬜
- fable5 전수 검사 리포트 + 실시간 협업/UUIDv7 외 필수 수정·마무리 구현 머지·재검증 green ⬜
- `docs/PROJECT_WORKLOG.md`(B-018) 최종 완료 갱신 ⬜
