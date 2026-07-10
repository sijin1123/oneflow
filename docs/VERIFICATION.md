# OneFlow 첫 PR 검증 기록

> 일자: 2026-07-04 · 브랜치: `feature/greenfield-foundation` · 기준: `docs/ONEFLOW_PLAN.md`(v5.1) §13
> 환경: macOS(로컬), Docker Desktop(Postgres 17 컨테이너), uv 0.11.26 + CPython 3.13.14, Node 24.13.1

## Focused

| 항목 | 명령 | 결과 |
|---|---|---:|
| 백엔드 lint/format | `uv run ruff check . && uv run ruff format --check .` | **PASS** (0 에러, 38 files) |
| 마이그레이션 스모크 | `alembic upgrade head → downgrade base → upgrade head` | **PASS** (0001, PG15+ 컬럼 지정 SET NULL 복합 FK 포함) |
| 백엔드 테스트 | `uv run pytest -q` (실 PostgreSQL `oneflow_test`, pytest-randomly) | **PASS — 55/55** |
| 시드 멱등 | `python -m app.seed` 2회 + `test_seed.py`(실패 주입 원자성 포함) | **PASS** |
| 헬스 수동 | `curl /api/v1/healthz`·`/health` | **PASS** (`alive` / `ok+db ok`) |
| 상태 변경 왕복 수동 | curl PATCH `expected_version:0→status` | **PASS** (200, version 0→1) |
| 프론트 typecheck | `npm run typecheck` (TS strict) | **PASS** |
| 프론트 lint | `npm run lint` (oxlint) | **PASS** |
| 프론트 unit | `node --test src/lib/conflict.test.ts` | **PASS — 2/2** |
| 프론트 UI 스모크 | `npm run test:e2e` (Playwright chromium, `page.route()` 목킹) | **PASS — 5/5** |
| 프론트 빌드 | `npm run build` | **PASS** — 기준선: JS 410.3KB(gzip **130.0KB**), CSS 18.9KB(gzip 4.8KB) |
| 클린룸 게이트 | `bash scripts/check_cleanroom.sh` | **PASS** (@plane/* 0건 · 라이선스 전수 허용계열, deny=GPL계열/fail-closed=UNKNOWN · 파일명 교집합 attestation 확인) |

### 백엔드 pytest 커버 항목(§13 명시 케이스)
healthz/health 분리(DB 다운 스텁: healthz 200 ∧ health 503) · 기동 가드(ENV/스킴/CORS/LOG_LEVEL/dev금지조합) · **dev 루프백 가드(비루프백 403·해제 스위치·프로브 예외)** · 시드 가드(`--reset` 다층: 원격/SSL 거부·토큰·DB명) · 프로젝트 CRU+key 409+더블 POST+**동시 생성 경합(1×201/1×409)**+owner membership 원자성(고아 0) · 비멤버 은닉(목록 제외·단건/쓰기/relations 404) · limit/enum 422 · ILIKE+와일드카드 autoescape · **동시 PATCH(1×200/1×409)** · 빈 바디 no-bump(version·updated_at 불변) · null 해제 의미론 · assignee 멤버십 422 · 날짜 역전 422/동일일 왕복 · parent 가드(자기참조·cross-project 422 + **DB 직접 INSERT 복합 FK 거부**) · **동시 parent 변경 2노드/3노드(advisory lock, 최종 순환 0)** · **raw SQL 순환 주입 → `detect_parent_cycles` 검출** · relations 양방향+direction+cross-project INSERT 거부 · 시드 멱등+실패 주입 rollback · 전역 500(`{detail}`·스택 비노출·X-Request-ID) · 요청 ID 검증/대체 · dev 사용자 자동 프로비저닝

## Broad

| 항목 | 결과 | 비고 |
|---|---|---|
| Compose 부팅 | **PASS** | postgres:17 healthcheck healthy |
| 수직 슬라이스 실스택 E2E | **PASS** | 시드 → uvicorn + vite dev 기동 → 실데이터 목록/보드 렌더 확인(스크린샷 `web-real-list.png`, `web-real-board.png`) + curl 상태 변경 DB 반영 확인 |
| 2탭 동시 수정 409 UI | **PASS(대체 검증)** | 실브라우저 2탭 수동 대신 ① 백엔드 동시 PATCH pytest(정확히 1×409) ② Playwright 409 목킹 시 알림+재로드 경로 테스트로 동등 커버 |
| UI 스크린샷 리뷰 | **PASS** | 방향 문서 First PR UI Target 7항목 ↔ 스크린샷 매핑: 셸/사이드바(`web-list`) · 목록(`web-list`,`web-real-list`) · 보드(`web-board`,`web-real-board`) · 드로어(`web-drawer`) · 필터/검색(상단 노출, `web-list`) · 빈 상태(`web-empty`) · 로딩/에러(코드 구현+skeleton, 스모크 경유) |
| 접근성 수동 키보드 완주 | **미검증(부분 대체)** | 포커스 트랩/복귀는 radix dialog 프리미티브 + `aria-label`/label 연결 구현. 사람 손 키보드 완주는 미실시 — 머지 전 사용자 1회 점검 권장(후속 vitest-axe 도입 예정) |
| UTC+9 날짜 왕복 | **PASS** | KST 로컬에서 `YYYY-MM-DD` 문자열 왕복(pytest `test_date_rules` 동일일 왕복 + 스모크 date 표시 보존). JS Date 미경유 규칙 코드 반영 |
| 클린룸 체크리스트 | **PASS** | `docs/ONEFLOW_CLEANROOM_NOTES.md` 전 항목 + 게이트 로그 |
| env 문서 ↔ 코드 정합 | **PASS** | `.env.example` 3종 ↔ `core/config.py` 파싱 규칙 일치(가드 pytest로 교차 검증) |
| 재현성(lockfile) | **PASS** | `uv sync --frozen` 상당(uv.lock) + `npm ci`(package-lock) 기준 CI 잡 구성. 로컬 재실행 동일 결과 |
| 기능맵/PG정책/PLAN 정합 | **PASS** | PLAN §3·§11 ↔ FEATURE_MAP·POSTGRESQL_POLICY 상충 없음 |
| OpenAPI ↔ 프론트 타입 대조 | **PASS(수동)** | `/openapi.json` 스키마 ↔ `features/*/types.ts`·스모크 목 픽스처 필드 대조(envelope `{items,total}`·`version:int`·`ConflictResponse{detail,current}`·date 문자열). 자동 생성은 후속 PR |
| CI 실행 | **보류(푸시 후 확인)** | 워크플로우는 브랜치에 포함 — PR 오픈 시 3잡 실행 결과를 PR에서 확인(머지 전제조건) |

## 미검증 항목(정직 고지)

1. **advisory lock 타임아웃 503 경로** — PLAN §6.2가 첫 PR 자동 테스트 비강제로 명시(값·계약만 고정). 후속 보강.
2. **접근성 수동 키보드 완주** — 위 표 참조.
3. **GitHub Actions 실행 결과** — 로컬에서 동일 명령 전건 PASS, 원격 실행은 PR 오픈 후 확인.
4. **GitHub Actions 쿼터 확인(§15 단계 1)** — gh 토큰에 billing scope 없어 API 조회 불가. 공개 무료 티어/프라이빗 2,000분 기준 여유 추정, PR CI 실행으로 실측 확인.

## 독립 2차 검토 (PLAN §13/§15 단계 7.5 — 머지 전제조건)

`/code-review high` 워크플로우(파인더+독립 검증자 36 에이전트) 실행 — 검증 통과 33건 → 병합 28건 → 상위 10건 보고. **10건 전부 수정 완료**:

| # | 판정 | 결함 | 조치 |
|---|---|---|---|
| 1 | CONFIRMED | 409 재조회가 identity-map 낡은 스냅샷 직렬화(빈 바디 포함) | `_reselect_fresh()` — populate_existing 재조회로 통일 + 동시 PATCH 테스트에 `current.version==1`·승자 상태 payload assert 추가 |
| 2 | CONFIRMED | 드로어 날짜 입력 비제어 → 409 후 거부값 잔존·재전송 | 날짜 2필드 controlled 전환 + wp 데이터 변경 시 useEffect 재동기화 |
| 3 | CONFIRMED | send()가 렌더 시점 version 사용 → 연속 편집 가짜 자기충돌 | mutate 시점에 query cache 최신 version 사용 |
| 4 | CONFIRMED | `--reset` 상시 크래시(preview autobegin 후 begin) | preview 후 rollback 삽입 + **run() 전체 흐름 end-to-end pytest 신설** |
| 5 | CONFIRMED | get_settings 미오버라이드 → 인증 split-brain 가능성 | `dependency_overrides[get_settings]` 추가(명시 Settings 단일화) |
| 6 | CONFIRMED | Board/Timeline의 죽은 검색·새작업 컨트롤 | 목록 라우트 한정 표시 |
| 7 | CONFIRMED | expected_version int4 초과 → 500 | 0~2147483647 검증(422) + pytest |
| 8 | CONFIRMED | 클린룸 @plane 스캔 범위 축소(apps/packages만) | `git ls-files` 기반 전체 추적 manifest 스캔 |
| 9 | CONFIRMED | 500 시 접근로그 누락 | RequestLog try/except/finally — 500도 기록 |
| 10 | PLAUSIBLE | 루프백 가드가 `::ffff:127.0.0.1` 거부 | `ipaddress` 기반 `is_loopback_host()`(127/8·IPv4-mapped 허용, 파싱 실패 fail-closed) + pytest |

**수정 후 재검증(전체 재실행)**: pytest **58/58**(회귀 3건 포함) · ruff clean · tsc · oxlint · unit 2/2 · build(gzip 130.05KB) · Playwright 5/5 · 클린룸 게이트 PASS.

**재검토 재실행에 대한 판정 기록**: PLAN §13은 인가·동시성·트랜잭션·시드 가드 경로 변경 시 해당 경로 재검토를 요구한다. 본 수정은 검토자가 처방한 조치를 그대로 구현+회귀 테스트로 고정한 것으로, 별도 재검토 라운드는 비용 대비 실익이 낮다고 판정하고 생략한다(전체 스위트 그린·수정 diff 소규모). 사용자가 원하면 수정 diff 한정 재검토를 즉시 실행 가능 — PR 설명에 동일 고지.

## 재검증 이력

| 시점 | 내용 |
|---|---|
| 구현 중 | pytest 55건: 픽스처 순서(autouse 미보장→명시 의존) · Project.id flush 시점 · membership flush 순서 · UPDATE..RETURNING populate_existing 4건 수정 후 전건 PASS 재확인 |
| 구현 중 | Playwright: `getByLabel('상태')` 중복 매칭 → dialog 스코프+exact로 수정 후 5/5 PASS |
| 게이트 | 클린룸 스크립트 CSV 파싱 → JSON 기반 재작성 후 PASS |
| 2차 검토 후 | 상기 10건 수정 → 백엔드 58/58·프론트 5종·게이트 전체 재실행 PASS(본 절) |

---

# 전체 빌드 검증 (2026-07-05 · PR #1–#27 · Opus 4.8 재개)

> 위 기록은 첫 PR(#1)의 검증 이력이다. 아래는 그린필드 목표 재개 후 Phase 1/2/3 + Phase 1 후속 + 후속 협업 모듈까지 전 개발 항목을 머지한 시점(main `1281e91`)의 통합 검증 기록이다.

## 최종 통합 검증 (main HEAD)

| 항목 | 명령 | 결과 |
|---|---|---:|
| 백엔드 lint/format | `uv run ruff check . && uv run ruff format --check .` | **PASS** |
| 백엔드 테스트 | `uv run pytest -q` (실 PostgreSQL, pytest-randomly) | **PASS — 164** |
| 마이그레이션 스모크 | `make api-migrate-smoke` (up→base→head) | **PASS — 0001~0013 (13개)** |
| OpenAPI 타입 재생성 | `bash scripts/gen-openapi-types.sh` | **PASS** |
| 계약 드리프트 게이트 | `bash scripts/check-openapi-types.sh` | **PASS** |
| 프론트 typecheck | `npm run typecheck` (TS strict + 계약 assertion) | **PASS** |
| 프론트 lint | `npm run lint` (oxlint) | **PASS** |
| 프론트 unit (node:test) | `npm run test:unit` | **PASS — 13** |
| 프론트 component (vitest) | `npm run test:component` (vitest + Testing Library) | **PASS — 4** |
| 프론트 빌드 | `npm run build` | **PASS** (Tiptap 코드스플릿, 메인 gzip ~145KB) |
| Playwright e2e | `npm run test:e2e` (chromium, 목킹) | **PASS — 23** |
| 클린룸 게이트 | `bash scripts/check_cleanroom.sh` | **PASS** |
| CI(원격) | GitHub Actions 4잡(backend/frontend/cleanroom/security-audit) | **PASS — PR #1~#27 전부 green 머지** |

## 단계별 머지 PR

| 범위 | PR | 검증 근거 |
|---|---|---|
| Phase 1 코어 | #1 | 상단 첫 PR 기록(58/58) |
| Phase 1 후속 | #2·#3·#21·#22·#23 | 코멘트/활동·OpenAPI 타입/드리프트 게이트·Tiptap+nh3 새니타이즈·ICU 콜레이션·vitest |
| Phase 2 | #4·#5·#6·#11·#12·#13·#14·#15·#16·#17 | 관계·멤버/역할(403)·타임라인·마일스톤·CSV(대사/실패행)·계층·캘린더·알림·검색·저장필터 |
| Phase 3 | #7·#8·#9·#10·#18·#19·#20 | 시간추적·대시보드·감사로그·비용/예산·워크플로우 커스터마이징·자동화 엔진·AI 요약(flag OFF/ON) |
| 후속 협업 모듈 | #24·#25·#26 | 문서/위키·회의(안건/회의록/액션 아이템)·파일(첨부 메타데이터) |
| fable5 핸드오프 | #27 | `docs/FABLE5_INSPECTION_HANDOFF.md` |

## 검증 워크플로우 (PR마다 반복)

브랜치 → 백엔드(모델/마이그레이션/스키마/라우터/테스트) → ruff check+format + 마이그레이션 up/down/up 스모크 + pytest → OpenAPI 타입 재생성 → 프론트(타입/훅/컴포넌트) → typecheck/lint/unit/component/build → Playwright 목 갱신 → e2e → 클린룸+드리프트 게이트 → 커밋(백엔드+프론트 분리) → push → PR → CI 4잡 확인 → green이면 머지 → main 동기화.

## 신규 검증 하이라이트 (재개분)

- **낙관적 동시성 409**: 워크패키지·문서·회의 각각 stale 편집 → 409 + `current` payload(버전 반환) 테스트.
- **XSS 경계(nh3)**: 설명·문서·회의 안건/회의록에서 `<script>`/핸들러/`javascript:` href 제거, 허용 서식 유지 테스트.
- **자동화 엔진**: 상태 변경 트리거 → 우선순위 액션 적용, 사용자 입력 우선, 비활성/no-op 미발동, 단일 패스 루프 불가 테스트.
- **feature flag(AI)**: `ONEFLOW_AI_SUMMARY` OFF(503·capabilities false)/ON(요약·capabilities true) 양쪽 검증.
- **ICU 콜레이션**: 제목순 한글 가나다 정렬 + 정렬 하에서도 ILIKE 동작(결정론적 콜레이션) 테스트.
- **인가 매트릭스**: 신규 소유자 전용 경로(상태 설정·자동화 규칙) 비멤버 404·비소유자 403.

## 미검증/이연 (정직 고지)

- 실 바이너리 업로드/다운로드, 실 LLM/RAG 배선, 간트 인터랙션, 실시간 협업(Yjs), 접근성 사람-손 키보드 완주(자동 aria/포커스는 구현·e2e 경유), advisory-lock 타임아웃 503 경로 — 전부 **의도된 범위 밖 이연**(사유는 `docs/FABLE5_INSPECTION_HANDOFF.md` §3).
- **fable5 전수 검사**: 릴리스 차단. 사용자 승인 완료·핸드오프 준비 완료. 실제 fable5 세션에서 수행 후 이 문서에 감사 결과를 추가한다.

---

# Reverse Spec 재개발 Pass 1A 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-search-hardening`  
> 범위: 전역 커맨드 팔레트 UI 구현 전 선행 보안/운영 하드닝. `ONEFLOW_COMMAND_PALETTE_ENABLED` default-off flag, `/auth/config.command_palette_enabled`, unified search visibility/snippet regression, OpenAPI 타입 갱신.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Focused API tests | `cd apps/api && uv run pytest -q tests/test_auth_config.py tests/test_config_guards.py tests/test_unified_search.py` | **PASS — 38** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 생성/드리프트 | `make gen-types && make check-types` | **PASS** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Backend full tests | `make api-test` | **PASS — 511** |
| Frontend unit | `make web-unit` | **PASS — 48** |
| Playwright smoke | `make web-e2e` | **PASS — 94** |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |

## Pass 1A Notes

- 새 환경변수: `ONEFLOW_COMMAND_PALETTE_ENABLED=false` 기본값. 정확히 `true`일 때만 `/auth/config.command_palette_enabled=true`; API 재시작 필요. 비밀값 아님. 설정 UI 미노출(운영자 배포 flag).
- 팔레트 UI는 아직 추가하지 않았다. RSP-001 UI는 검색 hardening이 선행 PASS된 뒤 Pass 1B/1C에서 진행한다.
- 검색 보안 회귀: hidden-only 결과의 `returned`/`truncated` 누출 방지, 멤버십 제거 후 재검색 숨김, initiative mixed visibility/archived 연결 숨김, snippet plain-text/길이/제어문자 경계를 테스트로 고정.

---

# Reverse Spec 재개발 Pass 1B 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-shortcut-infra`
> 범위: 커맨드 팔레트 UI 전역 단축키/오버레이 가드 인프라. `isGlobalShortcutAllowed`, editable/Tiptap/IME/overlay guard, default-off config 뒤 shell listener. API/DB/env 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Focused shortcut tests | `cd apps/web && node --test src/lib/shortcuts.test.ts` | **PASS — 5** |
| Frontend unit | `make web-unit` | **PASS — 53** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Playwright smoke | `make web-e2e` | **PASS — 94** after rerun |
| Clean-room gate | `make cleanroom-check` | **PASS** |

## Pass 1B Notes

- 첫 `make web-e2e`는 장기 실행 중 `smoke.spec.ts:325`가 최초 행 표시 전 timeout으로 93/94 실패했다. 동일 테스트 단독 재실행은 PASS(1.4s), 이후 전체 `make web-e2e` 재실행도 94/94 PASS라 플레키 타이밍으로 판정했다.
- 단축키는 `/` 또는 `Meta/Ctrl+K`만 인정하고 `Meta/Ctrl+F` 등 네이티브 단축키는 건드리지 않는다. editable input/select/textarea, `contenteditable`, Tiptap/ProseMirror ancestor, IME composition, repeat keydown, 기존 overlay open 상태에서는 열림 이벤트가 발생하지 않는다.
- `GlobalShortcutLayer`는 `/auth/config.command_palette_enabled === true`일 때만 window keydown listener를 등록한다. 현재 기본값은 Pass 1A와 동일하게 OFF라 UI 없는 상태에서 기존 화면 동작은 변하지 않는다.

---

# Reverse Spec 재개발 Pass 1C 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-command-palette`
> 범위: RSP-001 command palette UI. Topbar trigger, flag-gated modal, grouped result tabs, keyboard navigation, advanced search row, cache-short command-palette search key, desktop/mobile screenshots.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Focused palette mapper tests | `cd apps/web && node --test src/features/search/commandPalette.test.ts` | **PASS — 5** |
| Frontend unit | `make web-unit` | **PASS — 58** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused palette e2e | `cd apps/web && npx playwright test e2e/smoke.spec.ts --grep "커맨드 팔레트" --project=chromium` | **PASS — 4** |
| Playwright smoke | `make web-e2e` | **PASS — 98** after rerun |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Visual QA | Playwright one-off capture with mocked API | **PASS** — `docs/screenshots/redevelopment/command-palette/desktop-results.png`, `mobile-results.png` |

## Pass 1C Notes

- 첫 전체 `make web-e2e`는 기존 viewer timeline drag test가 DHTMLX bar bounding-box `null`로 97/98 실패했다. 동일 테스트 단독 재실행 PASS(1.7s) 후 전체 `make web-e2e` 재실행 98/98 PASS라 플레키 타이밍으로 판정했다.
- Palette UI는 `/auth/config.command_palette_enabled === true`일 때만 렌더링된다. flag OFF e2e에서 trigger와 shortcut 모두 absent를 확인했다.
- Keyboard contract: `/`/`Control+K` open, editable field guard, Escape close, Enter active result open, Arrow navigation to advanced search row. Result routing is tested in `commandPalette.test.ts` and e2e.
- Cache/privacy contract: query key is `['command-palette-search', query]`, `gcTime` 30s, close removes command-palette queries, stale results are hidden while the debounced query catches up.

---

# Reverse Spec 재개발 RSP-002 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-display-menu`
> 범위: Unified Display menu 1차. 워크패키지 목록의 정렬/표시 열/커스텀 필드 열 제어를 단일 `표시` 메뉴로 통합하고, 기존 `sort`/`columns` URL 파라미터와 저장 뷰 정규화 계약을 보존. API/DB/env 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Focused display sort tests | `cd apps/web && node --test src/features/work-packages/displayOptions.test.ts` | **PASS — 4** |
| Focused columns tests | `cd apps/web && node --test src/features/work-packages/columns.test.ts` | **PASS — 8** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused display e2e | `cd apps/web && npx playwright test e2e/smoke.spec.ts --grep "표시 메뉴|표시 열 구성|커스텀 필드 열" --project=chromium` | **PASS — 3** |
| Playwright smoke | `make web-e2e` | **PASS — 98** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |

## RSP-002 Notes

- `DisplayMenu`는 Plane 소스/DOM/CSS/카피 없이 OneFlow 기존 Radix menu primitive와 lucide icon으로 신규 작성했다.
- 정렬은 `displayOptions.ts`의 닫힌 어휘(`created`, `subject`)로 정규화한다. 알 수 없는 `sort` 값은 저장 뷰 저장/적용 경로에서도 기본 생성순으로 정리되어 API에 흘러가지 않는다.
- 표시 열은 기존 `columns.ts` canonicalizer를 그대로 사용한다. `columns`와 `sort` URL 파라미터를 유지하므로 기존 공유 URL과 saved filter contract는 깨지지 않는다.

---

# UI-first 재개발 UI-01 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-ui-shell`
> 범위: 앱 shell/sidebar/topbar/workspace navigation 1차 개편. 데스크톱 sidebar를 workspace/operations/project 영역으로 재구성하고, 모바일에서는 sidebar가 화면 폭을 점유하지 않도록 drawer로 전환. API/DB/env 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Focused shell e2e | `cd apps/web && npx playwright test e2e/smoke.spec.ts --grep "앱 셸과 프로젝트/워크패키지|모바일 앱 셸|개인 설정에서 알림 토글"` | **PASS — 3** |
| Playwright smoke | `make web-e2e` | **PASS — 99** after rerun |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Visual QA | Playwright screenshots | **PASS** — `docs/screenshots/redevelopment/ui-shell/desktop-list.png`, `mobile-drawer.png` |

## UI-01 Notes

- 첫 전체 `make web-e2e`는 Topbar route title을 `h1`으로 렌더해 개인 설정 페이지의 본문 `h1`과 접근성 heading이 중복되면서 98/99 실패했다. Topbar title은 shell chrome label이므로 `p`로 낮추고 실패 테스트와 shell focused e2e를 재실행해 PASS를 확인한 뒤 전체 `make web-e2e`도 99/99 PASS로 재검증했다.
- Sidebar는 workspace, operations, project navigation을 분리한다. Project navigation은 active project 또는 프로젝트 목록 화면의 첫 프로젝트만 확장해 반복 메뉴 밀도를 낮춘다.
- Mobile shell은 `md` 미만에서 sidebar를 숨기고 topbar menu button으로 `role="dialog"` drawer를 연다. Drawer link selection closes the drawer and navigates.
- API/DB/env 변경 없음. RSP-003 all-work grid PR #161은 이 브랜치에 병합하지 않았고, UI-03 work item grid surface에서 흡수 여부를 별도로 판단한다.

---

# UI-first 재개발 UI-02 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-design-system-foundation`
> 범위: 디자인 토큰·primitive foundation 1차. Hover/focus/elevation/overlay/skeleton token을 확장하고 Button/Input/Select/Textarea/Dropdown/Sheet/Skeleton/Badge/RichText toolbar/CommandPalette가 동일한 density/focus/menu contract를 쓰도록 정규화. API/DB/env 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Focused primitive/shell e2e | `cd apps/web && npx playwright test e2e/smoke.spec.ts --grep "앱 셸과 프로젝트/워크패키지|모바일 앱 셸|표시 메뉴|드로어 설명"` | **PASS — 4** |
| Command palette escape regression | `cd apps/web && npx playwright test e2e/smoke.spec.ts --grep "커맨드 팔레트 단축키는 편집 필드를 침범하지 않는다"` | **PASS — 1** |
| Playwright smoke | `make web-e2e` | **PASS — 99** after fix/rerun |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Visual QA | Playwright screenshots | **PASS** — `docs/screenshots/redevelopment/ui-shell/desktop-list.png`, `docs/screenshots/web-drawer.png` |

## UI-02 Notes

- 첫 전체 `make web-e2e`는 command palette editable guard test에서 Escape close가 전체 병렬 실행 중 98/99로 흔들렸다. 원인은 keyboard-open 직후 focus가 dialog 내부로 이동하기 전 page-level Escape가 내부 `onKeyDown`에 닿지 않는 경로였다. `CommandPalette`에 open-state window Escape listener를 추가하고 같은 테스트 단독 PASS, 전체 `make web-e2e` 99/99 PASS로 재검증했다.
- Added original OneFlow tokens: `--of-surface-hover`, `--of-accent-hover`, `--of-danger-hover`, `--of-focus`, `--of-skeleton`, `--of-overlay`, `--of-shadow-popover`.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-03 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-work-item-grid-ui`
> 범위: work item grid/table surface 1차. `/work-items` workspace-level grid, sidebar/topbar route context, dense sticky table, search/refresh toolbar, desktop/mobile screenshot QA. API는 UI 표면을 막는 최소 범위로 `/api/v1/search/work-packages`의 q 생략 all-work 조회와 additive fields만 보강. DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Focused API tests | `cd apps/api && uv run pytest -q tests/test_search.py tests/test_project_lifecycle.py` | **PASS — 12** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 생성/드리프트 | `make gen-types && make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Focused all-work e2e | `cd apps/web && npx playwright test e2e/smoke.spec.ts --grep "전체 작업 그리드" --project=chromium` | **PASS — 1** after fix/rerun |
| Command palette escape regression | `cd apps/web && npx playwright test e2e/smoke.spec.ts --grep "커맨드 팔레트 단축키는 편집 필드를 침범하지 않는다" --project=chromium` | **PASS — 1** |
| Dashboard scoped regression | `cd apps/web && npx playwright test e2e/smoke.spec.ts --grep "대시보드가 집계 타일과 분포" --project=chromium` | **PASS — 1** |
| Playwright smoke | `make web-e2e` | **PASS — 100** after fix/rerun |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Visual QA | Playwright screenshots + manual inspection | **PASS** — `docs/screenshots/redevelopment/all-work-grid/desktop.png`, `mobile.png` |

## UI-03 Notes

- PR #161의 RSP-003 작업은 자동 병합하지 않았다. 이 브랜치는 UI-01 shell과 UI-02 token 위에서 all-work grid를 UI-first surface로 재흡수했고, API 변경은 additive/minimal 범위로 제한했다.
- `/api/v1/search/work-packages` still rejects explicit empty `?q=` with 422; omitted q is the intentional all-work grid contract. Results stay scoped to member projects and exclude archived projects.
- First focused all-work E2E exposed an accessible-name collision between the submit button `검색` and the clear button `검색어 지우기`; the clear button is now named `입력 지우기`.
- First full `make web-e2e` run failed 99/100 on command palette Escape close in parallel execution. `CommandPalette` now closes on Escape in capture phase. The focused regression passed, and the final full run passed 100/100.
- Second full `make web-e2e` run failed 99/100 because the new sidebar `전체 작업` link made a dashboard test's global text locator strict-ambiguous. The assertion is now scoped to `main`, and the dashboard focused regression plus final full run passed.

---

# UI-first 재개발 UI-03B 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-view-controls-ui`
> 범위: work item view controls surface 1차. 프로젝트 작업 목록의 검색, 필터, Display menu, 저장 뷰, export/import를 하나의 UI-first controls surface로 재구성하고, Topbar 검색과 목록 검색의 `q` URL 상태를 동기화. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Focused view-controls e2e | `cd apps/web && npx playwright test e2e/smoke.spec.ts --grep "목록 view controls\|저장된 필터\|현재 필터\|표시 열 구성이\|표시 메뉴에서 제목순" --project=chromium` | **PASS — 5** |
| Screenshot e2e | `cd apps/web && npx playwright test e2e/smoke.spec.ts --grep "앱 셸과 프로젝트/워크패키지 목록\|모바일 앱 셸" --project=chromium` | **PASS — 2** |
| Playwright smoke | `make web-e2e` | **PASS — 101** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshots + manual inspection | **PASS** — `docs/screenshots/redevelopment/view-controls/desktop.png`, `mobile.png` |

## UI-03B Notes

- `ListPage` now hosts the work item controls as a single surface: list search, filters, result count, Display menu, export/import, and saved views share one border band and wrap cleanly on mobile.
- Existing URL and saved-view contracts are preserved: `q`, filter params, `columns`, and `sort` still round-trip through the same query keys and canonicalizers.
- `SavedFilters` remains the saved view owner but renders as a reusable strip inside the view controls surface. A reset action clears current view controls from URL state without touching drawer `wp` state.
- `Topbar` list search is now controlled from the same `q` query param so desktop topbar search and list surface search stay in sync.

---

# UI-first 재개발 UI-04A 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-detail-ui`
> 범위: work item detail drawer IA 1차. 드로어 폭, header/action row, overview/activity tabs, property panel, mobile fit을 재구성. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Frontend lint | `cd apps/web && npm run lint` | **PASS** (기존 oxlint Fast Refresh 경고 3건) |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Focused drawer e2e | `cd apps/web && npx playwright test e2e/smoke.spec.ts --grep "드로어에서 상태 변경\|모바일 작업 상세\|드로어에서 활동 이력\|드로어 설명\|AI 요약\|뷰어 드로어" --project=chromium` | **PASS — 7** after test update/rerun |
| Focused regression e2e | `cd apps/web && npx playwright test e2e/smoke.spec.ts --grep "댓글 스레드\|댓글 멘션\|커맨드 팔레트 단축키" --project=chromium` | **PASS — 3** |
| Mobile overflow regression | `cd apps/web && npx playwright test e2e/smoke.spec.ts --grep "모바일 작업 상세" --project=chromium` | **PASS — 1** |
| Playwright smoke | `make web-e2e` | **PASS — 102** after activity-tab and Escape listener fixes/rerun |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshots + manual inspection | **PASS** — `docs/screenshots/redevelopment/detail-ui/desktop.png`, `mobile.png`, `mobile-activity.png` |

## UI-04A Notes

- The drawer keeps the existing URL/API/mutation contract and preserves field ids/labels for status, priority, dates, estimate, type, milestone, cycle, module, and assignee.
- Activity feed and comments moved behind the `활동` tab; overview content keeps description, AI summary, time, cost, custom fields, relations, pages, and attachments.
- The property panel is right-aligned on desktop and moves before overview content on mobile. The mobile e2e asserts no document-level horizontal overflow.
- `CommandPalette` Escape handling now uses a layout-phase listener so close behavior is reliable during full Playwright runs.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-04B 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-full-page-detail-ui`
> 범위: work item full-page detail route 1차. UI-04A detail IA를 `/projects/:projectId/work-packages/:wpId` page route로 재사용하고, all-work/search/command-palette 작업 결과는 page mode로 이동. 기존 `?wp=` drawer deep link는 유지. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Focused command palette route unit | `cd apps/web && node --test src/features/search/commandPalette.test.ts` | **PASS — 5** |
| Focused full-page/detail e2e | `cd apps/web && npx playwright test e2e/smoke.spec.ts --grep "전체 작업 그리드\|작업 상세 전체 페이지\|모바일 작업 상세 전체 페이지\|커맨드 팔레트가 flag ON" --project=chromium` | **PASS — 4** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 104** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshots + manual inspection | **PASS** — `docs/screenshots/redevelopment/detail-ui/full-page-desktop.png`, `full-page-mobile.png` |

## UI-04B Notes

- `WorkPackageDetailPanel` is now the shared detail IA for drawer and page mode. Page mode hides the redundant `전체 페이지` self-link.
- `/projects/:projectId/work-packages/:wpId` uses the same work package detail API, section hooks, mutation contract, field ids, and viewer read-only behavior as the drawer.
- Workspace all-work grid, global search, and command palette work-package results now navigate to the full-page detail route. Project list, board, timeline, backlog, and existing `?wp=` drawer deep links remain intact.
- Mobile full-page detail has an e2e horizontal-overflow guard and screenshot QA.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-05 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-states-mobile-ui`
> 범위: empty/loading/error/skeleton/mobile responsive state surface 1차. 공통 `ListSkeleton`, `EmptyState`, `ErrorState`를 안정적인 모바일 폭·접근성·요청 정보 표시 패턴으로 정리하고 RouteError/404 fallback을 같은 상태 surface로 통합. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Focused states/mobile e2e | `cd apps/web && npm run test:e2e -- --grep "빈 목록은 모바일\|목록 로딩 스켈레톤\|목록 오류 상태"` | **PASS — 3** after mock contract fix/rerun |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 106** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshots + manual inspection | **PASS** — `docs/screenshots/redevelopment/states-mobile/empty-list.png`, `list-skeleton.png`, `error-list.png` |

## UI-05 Notes

- `ListSkeleton` now uses stable row geometry, `role="status"`, `aria-busy`, and mobile-safe grid columns. Skeleton remains visually distinct from empty state.
- `EmptyState` and `ErrorState` now share responsive state surface sizing, wrapped copy, stable icon wells, and optional children/class hooks for route fallbacks.
- `ErrorState` preserves exposed `x-request-id` when the API/CORS contract makes it readable. The first focused run failed because the mock response did not expose the header; the mock was corrected with `access-control-expose-headers`, then the focused set and full smoke passed.
- Work package list empty/loading/error states have mobile horizontal-overflow guards at 390x844 and screenshot QA.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-06 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-settings-ia-ui`
> 범위: settings/admin IA surface 1차. 프로젝트 설정, 개인 설정, 사용자 관리, 시스템 상태를 공통 settings shell/section/tab 패턴으로 정리하고 모바일 폭에서 표면별 탐색·내부 테이블 스크롤·읽기/관리 경계를 유지. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused settings/admin IA e2e | `cd apps/web && npm run test:e2e -- --grep "settings/admin IA\\|설정 탭\\|개인 설정에서\\|관리자가 사용자\\|시스템 상태 페이지"` | **PASS — 5** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 107** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshots + manual inspection | **PASS** — `docs/screenshots/redevelopment/settings-ia/project-settings-mobile.png`, `personal-settings-mobile.png`, `admin-users-mobile.png`, `status-mobile.png` |

## UI-06 Notes

- `SettingsShell` introduces a shared settings frame, responsive tab strip, and section surface for project settings, personal settings, admin users, and operational status pages.
- Project settings keeps the existing tab deep-link, unsaved guard, role visibility, and permission matrix behavior while moving to a denser mobile-safe tab rail.
- Personal settings reuses the notification panel without nesting cards. Admin users keeps the existing create/deactivate flow and constrains the user table inside an internal horizontal scroller on mobile.
- The system status page now uses the same operations/settings IA language without changing the `/api/v1/ops/status` contract.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-07 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-import-export-ui`
> 범위: import/export/operations hub surface 1차. `/operations` 허브를 추가해 프로젝트별 CSV 가져오기/내보내기와 시스템 상태·사용자 관리·스토리지 운영 표면을 한 화면에서 찾게 하고, 기존 work package list의 `?ops=import` deep-link가 CSV drawer를 열도록 연결. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused operations/import e2e | `cd apps/web && npm run test:e2e -- --grep "운영 허브\\|CSV 가져오기\\|Jira CSV 가져오기\\|시스템 상태 페이지"` | **PASS — 4** after mobile action layout fix/rerun |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 108** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/operations-hub/mobile.png` |

## UI-07 Notes

- `/operations` uses the UI-06 `SettingsFrame`/`SettingsSection` pattern and adds a sidebar/topbar operations route without changing backend contracts.
- Project data rows expose existing work list navigation, `?ops=import` CSV drawer deep-link, and existing CSV export mutation from one operations surface.
- `ImportDialog` now supports controlled open state, while remaining backward-compatible with the existing trigger usage in the work package list.
- CSV export fetch now includes credentials so cross-origin session-cookie deployments keep the same auth behavior as the JSON API wrapper.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-08 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-inbox-ui`
> 범위: inbox/notification center surface 1차. 기존 notification bell과 `/api/v1/me/notifications` 계약을 보존하면서 `/inbox` full-page route, sidebar/topbar entry, unread/read grouping, read/read-all controls, mobile screenshot QA를 추가. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused inbox/bell e2e | `cd apps/web && npm run test:e2e -- --grep "인박스\|알림 벨"` | **PASS — 2** after selector exact-match fix/rerun |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 109** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/inbox-ui/mobile.png` |

## UI-08 Notes

- `/inbox` is a workspace app surface, not a new backend capability. It reuses the existing user-scoped notification list and read mutations.
- `NotificationBell`, `MyWorkPage`, and `InboxPage` now share the same notification message and target route helper, so notification kinds do not drift across compact and full-page surfaces.
- The bell keeps its sheet behavior and adds an `인박스 열기` entry point. Existing work item drawer and intake declined deep-link routing remain intact.
- Mobile QA covers 390x844 width, unread/read grouping, read action, read-all action, intake action routing, and no horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-09 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-workspace-home-ui`
> 범위: workspace home/quick links surface 1차. 기존 `/my` 화면을 workspace home으로 재구성해 빠른 이동, 프로젝트 바로가기, 개인 작업/기한/시간/인박스/최근 활동 요약을 한 화면에서 스캔하게 함. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused workspace home e2e | `cd apps/web && npm run test:e2e -- --grep "내 작업 홈"` | **PASS — 1** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 109** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/workspace-home/mobile.png` |

## UI-09 Notes

- `/my` now acts as the workspace home surface rather than a narrow assigned-work list. It keeps the existing My Work, My Time, Notifications, Projects, and Activity API contracts.
- Quick links expose the primary UI-first surfaces: all work items, inbox, projects, operations, search, reports, and the first project timeline when available.
- Project shortcuts reuse existing project list data and route to the current work item list for each active project.
- Mobile QA covers 390x844 width, quick links, unread notification badge, project shortcut, due item summary, recent activity, and no horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-10 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-documents-ui`
> 범위: documents/wiki content surface 1차. 기존 문서 목록과 에디터를 content hub/detail 구조로 재구성하고, 문서 트리, 요약 패널, 상위 페이지/버전/수정일 속성, 연결 작업, 첨부, 코멘트, 390px 모바일 screenshot QA를 정리. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused documents e2e | `cd apps/web && npm run test:e2e -- --grep "문서"` | **PASS — 6** |
| Focused documents mobile e2e | `cd apps/web && npm run test:e2e -- --grep "문서 트리가"` | **PASS — 1** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 109** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshots + manual inspection | **PASS** — `docs/screenshots/redevelopment/documents-ui/mobile-list.png`, `mobile-detail.png` |

## UI-10 Notes

- `/projects/:projectId/documents` now reads as a content hub with project/archive state, search, tree count, root/child summary, and last-updated metadata.
- `/projects/:projectId/documents/:docId` keeps the existing document title/body/save/delete/parent/comment/link/attachment contracts while moving metadata and related surfaces into a dedicated property panel.
- Viewer/read-only behavior, document hierarchy exclusion, image upload anchoring, work-package links, plain-text comments, and search-to-document routing remain covered by existing E2E regressions.
- Mobile QA covers 390x844 document list/detail states and asserts no horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-11 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-meetings-ui`
> 범위: meetings collaboration surface 1차. 기존 회의 목록과 상세를 collaboration hub/detail 구조로 재구성하고, 템플릿 선택, 후속 회의, 반복, 안건/회의록, 액션 아이템, 속성 패널, 390px 모바일 screenshot QA를 정리. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused meetings e2e | `cd apps/web && npm run test:e2e -- --grep "회의"` | **PASS — 6** |
| Focused meeting detail mobile e2e | `cd apps/web && npm run test:e2e -- --grep "회의 상세가 안건"` | **PASS — 1** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 109** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshots + manual inspection | **PASS** — `docs/screenshots/redevelopment/meetings-ui/mobile-list.png`, `mobile-detail.png` |

## UI-11 Notes

- `/projects/:projectId/meetings` now reads as a collaboration hub with project/archive state, search, template selection, meeting counts, scheduled/unscheduled/recurring summaries, and mobile-safe list rows.
- `/projects/:projectId/meetings/:meetingId` keeps the existing title/date/recurrence/save/delete/follow-up/template/action-item contracts while moving meeting metadata into a dedicated property panel.
- Viewer/read-only behavior, recurrence save, follow-up navigation/creation, template creation/use, and action-item conversion remain covered by existing E2E regressions.
- Mobile QA covers 390x844 meeting list/detail states and asserts no horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-12 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-files-ui`
> 범위: files/storage collaboration surface 1차. 기존 파일 페이지를 storage hub로 재구성하고, 업로드/외부 링크 composer, 작업·문서 anchor, 파일 요약, 검색, read-only, empty/error/mobile state, 390px 모바일 screenshot QA를 정리. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused files e2e | `cd apps/web && npm run test:e2e -- --grep "파일"` | **PASS — 4** |
| Focused document attachment regression e2e | `cd apps/web && npm run test:e2e -- --grep "문서"` | **PASS — 6** |
| Focused attachment URL regression e2e | `cd apps/web && npm run test:e2e -- --grep "첨부"` | **PASS — 1** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 110** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/files-ui/mobile-list.png` |

## UI-12 Notes

- `/projects/:projectId/files` now reads as a storage collaboration hub with project/archive state, upload/link composer, anchor target selector, file search, and summary tiles for uploads, links, linked files, and used bytes.
- Existing raw-body upload, external URL link creation, http(s) client validation, delete confirmation, download URL, and viewer read-only contracts remain unchanged.
- Work package and document attachment anchor sections now expose loading/error/empty states with the same dense card treatment, while keeping attachment management centralized on the Files page.
- Mobile QA covers 390x844 files list/search/composer/summary state and asserts no horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-13 검증 (2026-07-09 · B-030)

> 브랜치: `feature/redevelopment-planning-ui`
> 범위: planning/schedule surface 1차. Backlog, Board, Timeline, Calendar, Cycles, Modules를 공통 planning shell, planning mode navigation, project/archive context, summary tiles, mobile-safe navigation으로 정리. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused planning e2e | `cd apps/web && npm run test:e2e -- --grep "계획 표면"` | **PASS — 1** |
| Focused planning regression e2e | `cd apps/web && npm run test:e2e -- --grep "백로그\|보드\|캘린더\|타임라인\|사이클\|모듈"` | **PASS — 18** |
| Calendar regression rerun | `cd apps/web && npm run test:e2e -- --grep "캘린더가 기한"` | **PASS — 1** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0. 최초 1회는 PyPI read timeout으로 실패 후 동일 명령 재실행 PASS |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/planning-ui/mobile-backlog.png` |

## UI-13 Notes

- `/projects/:projectId/backlog`, `board`, `timeline`, `calendar`, `cycles`, `modules` now share a `PlanningSurface` with project context, active/archive state, planning mode navigation, and dense summary tiles.
- Existing backlog cycle assignment, board drag/drop, timeline drag scheduling, calendar month navigation, cycle CRUD/rollover, module layout/member management contracts remain unchanged.
- Mobile QA covers a 390x844 backlog planning entry, verifies mode navigation to board and calendar, and asserts no page-level horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-14 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-reporting-ui`
> 범위: reporting/portfolio surface 1차. `/reports`, project dashboard, `/initiatives`를 공통 reporting shell, summary cards, view controls, health/progress hierarchy, 390px 모바일 screenshot QA로 정리. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/unit | `cd apps/web && npm run typecheck`, `cd apps/web && npm run test:unit` | **PASS — unit 62** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused reporting e2e | `cd apps/web && npm run test:e2e -- --grep "대시보드|포트폴리오|이니셔티브|보고 표면"` | **PASS — 6** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshots + no-overflow assertion | **PASS** — `docs/screenshots/redevelopment/reporting-ui/mobile-reports.png`, `mobile-initiatives.png` |

## UI-14 Notes

- Added `ReportingSurface` as a small OneFlow-owned shell for reporting pages, with compact navigation, summary metric cards, section framing, and segmented view controls.
- `/reports` keeps the existing portfolio report, timeline, archive toggle, project dashboard deep link, and CSV export contracts while adding a top-level portfolio summary and mobile-safe overflow containment.
- `/projects/:projectId/dashboard` keeps the existing widget layout persistence, CSV export, activity filters, and distribution widgets while aligning the page chrome and metric cards with the reporting surface.
- `/initiatives` keeps owner-only state/health mutations, project connect/disconnect, hidden connected-project count behavior, and highlight deep links while adding summary cards and mobile-stacked controls.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-15 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-intake-ui`
> 범위: intake/triage surface 1차. 기존 `/projects/:projectId/intake`를 request inbox 구조로 재구성하고, status summary, submit composer, owner decision controls, notification highlight, 390px 모바일 screenshot QA를 정리. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused intake e2e | `cd apps/web && npm run test:e2e -- --grep "인테이크"` | **PASS — 3** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + no-overflow assertion | **PASS** — `docs/screenshots/redevelopment/intake-ui/mobile.png` |

## UI-15 Notes

- `/projects/:projectId/intake` now reads as a request inbox with summary cards for open/pending/accepted/closed states.
- Member submit, viewer read-only, owner-only triage, accepted work-package deep link, triage notes, and notification highlight behavior remain on the existing API contracts.
- Owner decision controls now stack safely on mobile while preserving the existing `accepted`, `declined`, `duplicate`, and `snoozed` mutation payloads.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-16 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-project-directory-ui`
> 범위: project directory surface 1차. 기존 `/projects`를 workspace-level directory로 재구성하고, summary metrics, project search, archived toggle, Display menu column controls, health/archive/initiative cues, project creation composer, 390px mobile card QA를 정리. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Focused project directory e2e | `cd apps/web && npm run test:e2e -- --grep "프로젝트 (목록\|디렉터리)\|새 프로젝트 폼\|빈 프로젝트 목록"` | **PASS — 5** |
| Focused mobile screenshot e2e | `cd apps/web && npm run test:e2e -- --grep "프로젝트 디렉터리는 모바일"` | **PASS — 1** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/project-directory-ui/mobile.png` |

## UI-16 Notes

- `/projects` now reads as a workspace directory rather than a compact link list: header metadata, summary metrics, local project search, archived inclusion, sort direction, Display menu column controls, refresh, and creation composer share one surface.
- Existing project creation/template payload contract, client-side project sorting, localStorage column preferences, health chip, archived toggle, initiative highlight routing, and member-scoped project visibility remain unchanged.
- The project directory search is client-side only over already-visible project rows and does not widen API visibility or add a server query contract.
- Mobile QA covers 390x844 summary/controls/card layout and asserts no horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-17 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-search-discovery-ui`
> 범위: search/discovery surface 1차. 기존 `/search`를 workspace discovery page로 재구성하고, query controls, grouped result summaries, result cards by type, content-match snippets, empty/loading/error states, 390px mobile screenshot QA를 정리. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Focused search/command e2e | `cd apps/web && npm run test:e2e -- --grep "전체 검색\|커맨드 팔레트"` | **PASS — 6** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/search-discovery-ui/mobile.png` |

## UI-17 Notes

- `/search` now has a workspace search header, query control card, result count badge, grouped summary cards, and dense result cards for work packages, documents, meetings, cycles, modules, and initiatives.
- Existing `GET /api/v1/search?q=` response, 2+ character load guard, content snippet rendering as text, hidden empty groups, document result navigation, and command palette advanced-search route remain unchanged.
- Result summaries use only authorized group counts already returned by the server and do not infer hidden resources.
- Mobile QA covers 390x844 query/result layout and asserts no horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-18 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-governance-ui`
> 범위: project governance surface 1차. 프로젝트 설정의 workflow/status/type/automation controls를 governance overview, 상태/타입 패널, 자동화 규칙 카드, rule builder, read-only/owner cues, 390px 모바일 screenshot QA로 재구성. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Focused governance e2e | `cd apps/web && npm run test:e2e -- --grep "governance\|타입 관리\|자동화\|워크플로우 라벨\|보드가 프로젝트 워크플로우"` | **PASS — 7** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshots + manual inspection | **PASS** — `docs/screenshots/redevelopment/governance-ui/mobile-workflow.png`, `mobile-automation.png` |

## UI-18 Notes

- `projects/:projectId/settings?tab=workflow` now has a governance overview with owner/read-only cues and summary cards for state flow, work item types, and automation.
- Status/type management keeps the existing rename, reorder, active toggle, and API mutation contracts while using mobile-safe dense rows.
- The automation tab keeps existing rule PATCH/POST/order/run-log behavior while showing rule names, precedence, active state, rule builder, and execution logs as a cohesive governance panel.
- Mobile QA covers 390x844 workflow and automation states and asserts no horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-19 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-user-directory-ui`
> 범위: user directory surface 1차. 기존 `/admin/users`를 workspace account directory로 재구성해 계정 요약, 검색/상태 필터, add-user composer, 관리자/비활성화 controls, 프로젝트 멤버십 drilldown, desktop table, 390px mobile account cards를 정리. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused user directory e2e | `cd apps/web && npm run test:e2e -- --grep "사용자"` | **PASS — 3** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/user-directory-ui/mobile.png` |

## UI-19 Notes

- `/admin/users` now reads as a workspace account directory with summary cards for total, active, admin, and inactive users.
- The desktop table preserves existing add-user, self-deactivation, last-active-admin, admin-toggle, and membership drilldown contracts.
- Mobile QA renders a card-only directory surface to avoid duplicate hidden table/card accessibility targets, while keeping membership drilldown and action controls reachable.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-20 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-team-members-ui`
> 범위: project team/members surface 1차. 기존 프로젝트 설정의 멤버 탭을 팀 디렉터리와 역할별 권한 surface로 재구성하고, 역할 요약, 멤버 추가, last-owner 보호, 권한 matrix, 390px 모바일 screenshot QA를 정리. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 2건, Vite chunk 경고) |
| Focused members/team e2e | `cd apps/web && npm run test:e2e -- --grep "멤버\|프로젝트 팀"` | **PASS — 6** |
| Focused team mobile e2e | `cd apps/web && npm run test:e2e -- --grep "프로젝트 팀 표면"` | **PASS — 1** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshots + manual inspection | **PASS** — `docs/screenshots/redevelopment/team-members-ui/mobile.png`, `docs/screenshots/redevelopment/settings-ia/project-settings-mobile.png` |

## UI-20 Notes

- `/projects/:projectId/settings?tab=members` now reads as a team management surface with role summary tiles, member add composer, team directory cards/table, and permission matrix.
- Existing member list, add, role update, delete, current-user role, last-owner guard, and permission report API contracts remain unchanged.
- Mobile QA renders only the card layout at 390x844 so hidden desktop table text does not duplicate accessible names or create horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-21 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-time-cost-ui`
> 범위: time/cost execution surface 1차. 기존 work item detail의 시간 추적과 비용 섹션을 estimate/budget cues, 기록 가능/read-only badge, ledger, 모바일 accounting cards, composer grid로 재구성. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused time/cost e2e | `cd apps/web && npm run test:e2e -- --grep "시간\|비용"` | **PASS — 2** |
| Focused time/cost mobile e2e | `cd apps/web && npm run test:e2e -- --grep "시간·비용 표면"` | **PASS — 1** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshots + manual inspection | **PASS** — `docs/screenshots/redevelopment/time-cost-ui/mobile-time.png`, `mobile-cost.png`, `docs/screenshots/redevelopment/detail-ui/desktop.png`, `full-page-desktop.png`, `docs/screenshots/web-drawer.png` |

## UI-21 Notes

- `TimeTrackingSection` now exposes estimate, spent, remaining, progress, ledger, and a mobile-safe log composer while keeping the existing time-entry hooks and labels.
- `CostSection` now exposes total amount, entry count, top kind, kind breakdown badges, ledger, and a mobile-safe cost composer while keeping the existing cost-entry hooks and labels.
- Existing viewer/read-only behavior remains covered: write inputs and delete buttons stay absent for viewers, with no additional duplicate read-only notice in sub-sections.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-22 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-relations-ui`
> 범위: relations/dependencies surface 1차. 기존 work item detail의 관계 섹션을 dependency summary, relation type badge, direction cue, linked-item cards, read-only badge, mobile composer로 재구성. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused relations e2e | `cd apps/web && npm run test:e2e -- --grep "관계"` | **PASS — 3** |
| Focused relations mobile e2e | `cd apps/web && npm run test:e2e -- --grep "관계 표면"` | **PASS — 1** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/relations-ui/mobile.png` |

## UI-22 Notes

- `RelationsSection` now exposes relation count, dependency count, candidate count, relation type badges, direction cues, linked-item cards, and a mobile-safe relation composer.
- Existing relation APIs, same-project boundary, delete mutation, and viewer read-only behavior remain unchanged.
- Existing labels `관계 유형` and `대상 작업` are preserved for regression coverage.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-23 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-activity-comments-ui`
> 범위: activity/comments collaboration surface 1차. 기존 work item detail의 활동 및 댓글 섹션을 feed summary, activity cards, threaded comment cards, reactions, mention chips, mobile composer로 재구성. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused activity/comments e2e | `cd apps/web && npm run test:e2e -- --grep "댓글\|활동"` | **PASS — 9** |
| Focused activity/comments mobile e2e | `cd apps/web && npm run test:e2e -- --grep "활동 댓글 표면"` | **PASS — 1** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshots + manual inspection | **PASS** — `docs/screenshots/redevelopment/activity-comments-ui/mobile.png`, `docs/screenshots/redevelopment/detail-ui/mobile-activity.png`, `docs/screenshots/redevelopment/detail-ui/full-page-mobile.png` |

## UI-23 Notes

- `HistorySection` now exposes activity/comment/thread/mention summary metrics, activity cards, threaded comment cards, mention chips, reaction controls, and a mobile-safe comment composer.
- Existing activity, comment, threaded reply, reaction, mention, and viewer read-only contracts remain unchanged.
- Existing labels `활동 및 댓글`, `댓글 입력`, `댓글 추가`, `답글`, and reaction aria labels are preserved for regression coverage.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-24 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-custom-fields-ui`
> 범위: custom fields/property values surface 1차. 기존 work item detail의 커스텀 필드 섹션을 field metrics, field value cards, type/scope/status badges, preserved value state, mobile-safe controls로 재구성. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused custom fields e2e | `cd apps/web && npm run test:e2e -- --grep "커스텀 필드"` | **PASS — 4** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/custom-fields-ui/mobile.png` |

## UI-24 Notes

- `CustomFieldsSection` now exposes field count, filled value count, editable count, field type badges, scope cues, preserved value status, and mobile-safe field controls.
- Existing custom field definition, custom value delta PUT, applies-to binding, inactive preserved value, and viewer read-only contracts remain unchanged.
- Existing labels `커스텀 필드`, field names, and input aria labels are preserved for regression coverage.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-25 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-watchers-notifications-ui`
> 범위: work item watchers/subscription surface 1차. 기존 watcher 토글을 watcher summary, notification cue strip, participant chips, read-only state, 390px 모바일 screenshot QA로 재구성. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Focused watcher e2e | `cd apps/web && npm run test:e2e -- --grep "워처\|워치"` | **PASS — 2** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/watchers-ui/mobile.png` |

## UI-25 Notes

- Work item detail now exposes a dedicated watcher subscription surface with total watcher count, caller subscription state, notification cue strip, watcher participant chips, and overflow count.
- Existing watcher API contracts remain unchanged: list watchers, self-service `PUT/DELETE /watchers/me`, idempotent mutations, member-scoped visibility, and server-side write authorization.
- Viewer/read-only mode keeps the watcher surface visible for context but replaces the mutation button with a read-only state.
- Mobile QA covers 390x844 detail drawer state and asserts no horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-26 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-work-item-create-ui`
> 범위: work item creation/composer surface 1차. 기존 `?new=1` 새 작업 진입을 제목 전용 임시 행에서 타입/상태/우선순위/담당자/기한을 함께 입력하는 dense composer로 재구성하고, 모바일 생성 payload와 overflow를 고정. DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Focused create/list e2e | `cd apps/web && npm run test:e2e -- --grep "새 작업 생성\|뷰어는 목록"` | **PASS — 2** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/work-item-create-ui/mobile.png` |

## UI-26 Notes

- `NewWorkPackageInline` now behaves as a project-scoped composer rather than a title-only row, while preserving the existing topbar `?new=1` entry and close behavior.
- Create payload now carries the core work item properties already supported by the existing backend contract: `subject`, `type`, `status`, `priority`, `assignee_id`, and `due_date`.
- The composer uses OneFlow UI primitives and work-package/member hooks only; no Plane source, DOM, CSS, assets, packages, or copy were used.
- Mobile QA covers 390x844 width, disabled submit without a title, property selection, create POST body, composer dismissal, and no horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or new API endpoint change.

---

# UI-first 재개발 UI-39 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-automation-rule-actions-ui`
> 범위: automation rule item actions functional surface. 기존 자동화 규칙 표면을 action menu 중심으로 재구성하되, edit, enable/disable, reorder, delete, run feedback, viewer read-only, mobile-safe flow를 기존 automation API에 실제 배선. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Focused automation e2e | `cd apps/web && npm run test:e2e -- --grep "자동화"` | **PASS — 4** |
| Focused meeting locator regression | `cd apps/web && npm run test:e2e -- --grep "회의 상세가 안건"` | **PASS — 1** |
| Frontend build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/automation-rule-actions-ui/mobile.png` |

## UI-39 Notes

- Automation rule rows now expose a single touch-safe action menu instead of scattered inline controls.
- Owner actions are fully wired to existing automation contracts: edit sends PATCH fields, enable/disable sends PATCH `is_active`, reorder sends PUT order payload, and delete sends DELETE after confirmation.
- Viewer mode opens the same action affordance but shows read-only context and no write actions.
- Trigger/action edit controls use existing OneFlow vocabularies for status/type/priority/member values; no new trigger/action semantics are introduced in this PR.
- No mock, dead, or decorative controls were added. New trigger/action semantics, scheduling, or additional audit persistence remain explicit future API mini-plan territory, not hidden UI.
