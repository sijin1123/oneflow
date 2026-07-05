# OneFlow — fable5 전수 검사 핸드오프 프롬프트

> 작성: 2026-07-05 · 작성 모델: Opus 4.8 (개발 담당) · 대상 실행 모델: **fable5 전용**
> 상태: **사용자 승인 대기**. 이 문서는 승인 즉시 fable5 세션에서 붙여넣어 실행할 수 있는 준비 산출물이다.

## 0. 이 문서의 성격 (반드시 먼저 읽기)

- OneFlow 그린필드 목표(`docs/goals/ONEFLOW_GREENFIELD_GOAL.md`)의 **모든 개발 항목**(Phase 1/2/3 + Phase 1 후속 + 후속 협업 모듈)이 Opus 4.8에 의해 구현·검증·머지 완료되었다(총 26 PR).
- 목표 규약상 **전수 검사는 실제 fable5 세션에서만** 수행한다. Opus 4.8을 포함한 다른 모델은 검사를 수행·흉내 내지 않는다.
- 전수 검사는 **릴리스 차단(release-blocking)** 이다. fable5가 전체 코드베이스를 검사하고 필수 지적을 모두 수정·재검증하기 전에는 목표를 최종 완료로 보고하지 않는다.
- **시작 조건**: (1) 사용자가 `Phase 3 개발과 검증/머지가 완료되었습니다. fable5 전수 검사를 시작할까요?`에 명시 승인, (2) active model = fable5 확인. 둘 중 하나라도 미충족 시 검사 착수 금지.

## 1. 현재 상태 스냅샷 (검사 대상 baseline)

| 항목 | 값 |
|---|---|
| Repo | `https://github.com/sijin1123/oneflow.git` |
| 기본 브랜치 | `main` (검사 착수 시점 HEAD 재측정 필수) |
| 누적 PR | #1 ~ #26 (전부 CI 3잡 green 머지) |
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

## 3. 이미 알려진 이연/후속 (누락 아님 — 지적 대상 제외)

- 실 바이너리 업로드/다운로드(스토리지 백엔드·서명 URL·바이러스 스캔) — 인프라/비밀 필요.
- 실 LLM/RAG 배선(API 키·비용·프롬프트 정책) — AI는 로컬 provider + feature flag로 아키텍처만 준비.
- 간트 드래그/의존성 편집 — 라이선스 리스크로 경량 타임라인 대체.
- 커스텀 상태 KEY 추가/삭제·전이 규칙 — 현재는 라벨/순서 커스터마이징(키 고정).
- 실시간 협업(Yjs/WebSocket), UUIDv7 전환, 레거시 import 실행.

이들은 코드 결함이 아니라 **의도된 범위 밖 이연**이다. fable5는 "미구현"으로 지적하지 말고, 이연 근거의 타당성만 검토한다.

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
당신은 fable5 세션입니다. OneFlow 그린필드 목표(docs/goals/ONEFLOW_GREENFIELD_GOAL.md)의 전 개발 항목이 Opus 4.8에 의해 구현·머지 완료되었습니다(main, PR #1~#26, 마이그레이션 0001~0013). 이제 릴리스 차단 전수 검사를 수행하세요.

0. 먼저 active model이 fable5임을 확인하고, main HEAD·CI·PR 상태를 재측정하세요. fable5가 아니면 검사를 수행하지 말고 그 사실을 보고하세요.
1. docs/FABLE5_INSPECTION_HANDOFF.md의 §2 전 영역(backend, frontend, DB/migrations, auth/permissions, workflow, timeline/Gantt, time/cost, dashboard/report, settings, API contract, tests, CI, env/secrets, security, accessibility, performance, clean-room/license, docs, worklog)을 검사하세요.
2. §3의 알려진 이연 항목은 '미구현'으로 지적하지 말고 이연 근거만 검토하세요.
3. 필수 지적은 수정 → 테스트 추가/갱신 → 재검증 → 커밋 → PR → CI green 확인 → 머지까지 진행하세요(§4). 기본 브랜치 직접 커밋 금지, 작은 PR 유지, 검증 실패 상태 PR 금지.
4. §5 명령으로 재현·재검증하세요. 신규/변경 로직은 반드시 테스트를 동반하세요.
5. 감사 리포트와 수정 로그를 oneflow/docs/FABLE5_AUDIT_REPORT.md에 기록하고, docs/PROJECT_WORKLOG.md(B-018)를 갱신하세요(재검증 결과·머지 PR 링크 포함).
6. 모든 필수 수정 머지·재검증 green 후에만 목표 최종 완료를 보고하세요.
```

## 7. 완료 정의 (목표 최종 완료 조건)

- Phase 1/2/3 + 후속 모듈 구현·머지 완료 ✅ (본 시점 충족)
- 사용자 fable5 승인 ⬜
- active model = fable5 확인 ⬜
- fable5 전수 검사 리포트 + 필수 수정 머지·재검증 green ⬜
- `docs/PROJECT_WORKLOG.md`(B-018) 최종 완료 갱신 ⬜
