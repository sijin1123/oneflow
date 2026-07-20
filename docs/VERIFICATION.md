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

# UI-first 재개발 UI-27 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-bulk-edit-ui`
> 범위: work item bulk edit/selection surface 1차. 기존 목록 bulk-update 행위를 선택 요약, 현재 페이지 전체 선택, dense action controls, success result banner, skipped/unchanged feedback, 모바일 screenshot QA로 재구성. DB/env/migration/API endpoint 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Focused bulk e2e | `cd apps/web && npm run test:e2e -- --grep "일괄 작업\|목록 일괄"` | **PASS — 2** |
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
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/bulk-edit-ui/mobile.png` |

## UI-27 Notes

- The work item list now has a named bulk action surface with selected-count badge, selected item preview, current-page select-all control, status/priority/assignee controls, and an explicit clear-selection action.
- Successful bulk updates keep a result banner after selection clears, including updated, unchanged, and skipped counts from the existing opaque result contract.
- Assignee bulk edit now offers an explicit unassigned option that sends `assignee_id: null`; keeping the field unchanged remains the empty select value.
- Viewer/read-only behavior remains absence-based: no selection column and no bulk surface are rendered for non-writers.
- Mobile QA covers 390x844 width, select-all, action controls, partial result feedback, payload shape, and no horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or new API endpoint change.

---

# UI-first 재개발 UI-28 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-saved-views-ui`
> 범위: work item saved views management surface 1차. 기존 saved filter 칩 줄을 active view summary, saved-view cards, share/lock/delete affordances, empty state, save form, 모바일 screenshot QA가 있는 UI-first 표면으로 재구성. DB/env/migration/API endpoint 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Focused saved views e2e | `cd apps/web && npm run test:e2e -- --grep "저장 뷰\|저장된 필터\|현재 필터\|잠긴 뷰"` | **PASS — 5** |
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
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/saved-views-ui/mobile.png` |

## UI-28 Notes

- `SavedFilters` now renders as a named management region with total count, active view badge, current filter count, empty state, saved view cards, and responsive save form.
- Existing apply/save/share/lock/delete contracts are preserved, including canonicalized columns/sort params and author-only locked-view controls.
- The saved view apply button keeps its accessible name as the view name, so existing exact-name routing tests remain stable while metadata moves into card text.
- Mobile QA covers 390x844 width, active view summary, locked view absence of delete/share controls, save form controls, and no horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or new API endpoint change.

---

# UI-first 재개발 UI-29 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-row-actions-ui`
> 범위: work item row actions/inline affordance surface 1차. 목록 행에 hover/focus/touch-safe action menu를 추가하고, 상세 드로어, 전체 페이지, 링크 복사, 복제, 이동 패널 진입을 기존 계약 위에 연결. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Focused row-actions e2e | `cd apps/web && npm run test:e2e -- --grep "행 액션\|뷰어는 목록"` | **PASS — 3** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Playwright smoke | `make web-e2e` | **PASS — 112** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/row-actions-ui/mobile.png` |

## UI-29 Notes

- Work item list rows now expose a compact row action menu that is visible on mobile and on desktop hover/focus.
- Row actions reuse existing OneFlow contracts: `?wp=` drawer deep link, full-page detail route, duplicate mutation, and move panel. No new API or persistence surface was added.
- Link copy uses the full-page detail URL and falls back to an inline status message if clipboard access is unavailable.
- Viewer/read-only rows keep detail/full-page/link actions but do not expose duplicate or move actions.
- Mobile QA covers a 390x844 row action menu and asserts no page-wide horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-30 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-board-card-actions-ui`
> 범위: board/card actions surface 1차. 기존 보드 카드에 hover/focus/touch-safe 액션 메뉴를 추가하고, 상세 드로어, 전체 페이지, 링크 복사, 복제, 이동 패널, viewer read-only 표시를 연결. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Focused board card e2e | `cd apps/web && npm run test:e2e -- --grep "보드 카드 액션\|보드 뷰\|보드에서 카드를\|보드가 프로젝트"` | **PASS — 6** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Playwright smoke | `make web-e2e` | **PASS — 113** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/board-card-actions-ui/mobile.png` |

## UI-30 Notes

- Board cards now expose a compact action menu without nesting interactive controls inside the card open button.
- The menu connects existing contracts only: drawer deep link, full-page detail route, clipboard link, duplicate mutation, and move drawer section via `move=1`.
- Viewer/read-only cards keep navigation and copy actions while hiding write actions and showing a read-only cue.
- Mobile QA covers 390x844 width, touch-open menu behavior, and no horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-31 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-calendar-item-actions-ui`
> 범위: calendar item actions surface 1차. 기존 캘린더 due-date 항목에 hover/focus/touch-safe 액션 메뉴를 추가하고, 상세 드로어, 전체 페이지, 링크 복사, 복제, 이동 패널, viewer read-only 표시를 연결. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Focused calendar e2e | `cd apps/web && npm run test:e2e -- --grep "캘린더"` | **PASS — 4** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Playwright smoke | `make web-e2e` | **PASS — 113** after rerun |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/calendar-item-actions-ui/mobile.png` |

## UI-31 Notes

- Calendar due-date items now expose a compact action menu without nesting interactive controls inside the item open button.
- The menu connects existing contracts only: drawer deep link, full-page detail route, clipboard link, duplicate mutation, and move drawer section via `move=1`.
- Viewer/read-only items keep navigation and copy actions while hiding write actions and showing a read-only cue.
- The first full `make web-e2e` run had one pre-existing timeline viewer drag bounding-box miss (`112/113`); the failed test passed alone, then full `make web-e2e` rerun passed `113/113`.
- Mobile QA covers 390x844 width, touch-open menu behavior, and no horizontal overflow.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-32 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-tree-item-actions-ui`
> 범위: work item tree/hierarchy item actions surface 1차. 기존 계층 트리 행에 hover/focus/touch action menu, quick detail drawer, full-page detail, link copy, duplicate, move-panel deep link, viewer read-only cues, 390px 모바일 screenshot QA를 추가. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Focused tree e2e | `cd apps/web && npm run test:e2e -- --grep "트리"` | **PASS — 5** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 113** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/tree-item-actions-ui/mobile.png` |

## UI-32 Notes

- Tree rows now expose an item action menu without making the row itself a nested interactive control. Expand/collapse, subject open, and action menu remain separate buttons.
- The menu reuses existing OneFlow contracts: `?wp=` drawer state, full-page detail route, duplicate API, and the drawer move panel via `?move=1`.
- Viewer/read-only projects keep read actions while hiding duplicate/move and showing a disabled write-permission cue.
- Mobile QA covers 390x844 tree action access without hover, menu viewport fit, readable labels, and no page-wide horizontal overflow.
- Focused e2e first exposed a selector ambiguity because the new action button's accessible name includes the work item title. The test was narrowed to exact subject buttons, then the focused tree suite passed.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-33 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-timeline-item-actions-ui`
> 범위: timeline work item action surface. 기존 DHTMLX 타임라인 막대 위에 hover/tap 없이 접근 가능한 항목 액션 메뉴를 붙이고, 상세 드로어, 전체 페이지, 링크 복사, 복제, 이동 패널, viewer read-only 상태, 390px 모바일 screenshot QA를 정리. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Focused timeline e2e | `cd apps/web && npm run test:e2e -- --grep "타임라인"` | **PASS — 7** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 113** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/timeline-item-actions-ui/mobile.png` |

## UI-33 Notes

- `/projects/:projectId/timeline` now exposes a compact action button inside each work-package timeline bar, so users can open detail, copy a stable link, duplicate, or open the move panel without leaving the schedule context.
- DHTMLX drag behavior remains protected: the action button stops pointer/keyboard events before they reach the drag layer, while existing bar click/double-click and read-only drag tests remain covered.
- Viewer/read-only behavior keeps navigation and link copy available but hides write actions behind a single read-only cue.
- Mobile QA covers 390x844 timeline action menu positioning and asserts the fixed menu stays inside the viewport without hover.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-34 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-backlog-item-actions-ui`
> 범위: backlog work item action surface. 기존 백로그 행에 항목 액션 메뉴를 붙이고, 상세 드로어, 전체 페이지, 링크 복사, 복제, 이동 패널, cycle assignment coexistence, viewer read-only 상태, 390px 모바일 screenshot QA를 정리. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Focused backlog e2e | `cd apps/web && npm run test:e2e -- --grep "백로그"` | **PASS — 4** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 113** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/backlog-item-actions-ui/mobile.png` |

## UI-34 Notes

- `/projects/:projectId/backlog` now exposes a compact action button per backlog item, so users can open detail, copy a stable link, duplicate, or open the move panel without leaving backlog planning.
- Existing cycle assignment remains the primary backlog action and still PATCHes `cycle_id` with `expected_version`; the action menu coexists beside it without consuming the select flow.
- The detail drawer now understands `move=1` and clears that param on close, so backlog and later planning surfaces can deep-link directly to the move panel without new API contracts.
- Viewer/read-only behavior keeps navigation and link copy available but hides write actions behind a single read-only cue.
- Mobile QA covers 390x844 backlog action menu positioning and asserts the fixed menu stays inside the viewport while the cycle select remains usable.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-35 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-cycle-item-actions-ui`
> 범위: cycle/sprint item actions surface 1차. 사이클 행의 번다운·편집·삭제·미완료 이월·작업 목록 이동을 공통 row action menu로 통합하고, 모바일 폭/뷰어 읽기 전용 상태를 고정. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Whitespace gate | `git diff --check` | **PASS** |
| Focused cycle e2e | `cd apps/web && npm run test:e2e -- --grep "사이클"` | **PASS — 5** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Playwright smoke | `make web-e2e` | **PASS — 112** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/cycle-item-actions-ui/mobile.png` |

## UI-35 Notes

- 사이클 행은 제목/날짜/진행률을 모바일에서 자연스럽게 줄바꿈하고, 우측 `MoreHorizontal` 액션 버튼으로 조작을 모은다.
- `CycleItemActions`는 작업 목록 이동, 번다운 토글, owner-only 편집/삭제/미완료 이월, viewer read-only 안내를 한 메뉴에서 제공한다.
- 기존 사이클 생성, 번다운 조회, 완료 사이클 rollover, 권한 분기, 작업 목록 `cycle_id` deep-link 계약은 유지했다.
- 모바일 QA는 390x844 폭에서 액션 메뉴 bounding box와 horizontal overflow를 함께 확인한다.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-36 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-module-item-actions-ui`
> 범위: module item actions surface 1차. 모듈 목록 행의 작업 목록 이동·참여자 관리·편집·삭제를 공통 row action menu로 통합하고, 모바일 폭/뷰어 읽기 전용 상태를 고정. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck | `cd apps/web && npm run typecheck` | **PASS** |
| Whitespace gate | `git diff --check` | **PASS** |
| Focused module e2e | `cd apps/web && npm run test:e2e -- --grep "모듈"` | **PASS — 4** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Playwright smoke | `make web-e2e` | **PASS — 112** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/module-item-actions-ui/mobile.png` |

## UI-36 Notes

- 모듈 목록 행은 제목/상태/리드/참여자/진행률을 모바일에서 자연스럽게 줄바꿈하고, 우측 `MoreHorizontal` 액션 버튼으로 조작을 모은다.
- `ModuleItemActions`는 작업 목록 이동, 참여자 관리, owner-only 편집/삭제, viewer read-only 안내를 한 메뉴에서 제공한다.
- 기존 모듈 생성, 참여자 PUT, 상태/리드/이름 PATCH, 작업 목록 `module_id` deep-link 계약은 유지했다.
- 모바일 QA는 390x844 폭에서 액션 메뉴 bounding box와 horizontal overflow를 함께 확인한다.
- No feature flag, environment variable, backend, database, migration, or API contract change.

---

# UI-first 재개발 UI-37 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-milestone-item-actions-ui`
> 범위: milestone/release item actions surface 1차. 프로젝트 설정의 마일스톤 행을 action menu, filtered work item navigation, inline edit, delete confirmation, progress/due-date cues, viewer read-only cue, 390px 모바일 menu QA 중심으로 재구성. API는 기존 work package list endpoint에 `milestone_id` 필터를 추가하고 saved view params에 같은 키를 허용하는 최소 보강만 수행.

| 항목 | 명령 | 결과 |
|---|---|---:|
| OpenAPI 타입 생성 | `make gen-types` | **PASS** — `packages/shared/src/api-types.ts` 갱신 |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Focused milestone e2e | `cd apps/web && npm run test:e2e -- --grep "마일스톤"` | **PASS — 4** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Focused API regression | `cd apps/api && uv run pytest tests/test_milestones.py tests/test_saved_filters.py tests/test_views.py -q` | **PASS — 20** (Alembic config deprecation warning 1건, 기존 경고) |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 514** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/milestone-item-actions-ui/mobile.png` |

## UI-37 Notes

- `/projects/:projectId/settings?tab=milestones` now presents milestone rows as compact release items with progress, due date, work-list navigation, edit/delete action menu, and viewer read-only cue.
- `/projects/:projectId/work-packages?milestone_id=...` is now a real list filter path; the filter is visible in the work item filter row and can be preserved in saved views.
- Backend/API changes are additive only: `milestone_id` query param for project work package list and `milestone_id` saved filter param validation.
- No feature flag, environment variable, database migration, or destructive data change.

---

# UI-first 재개발 UI-38 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-workflow-item-actions-ui`
> 범위: project settings workflow status/type item actions surface. 상태/타입 행의 인라인 편집·순서·활성 상태 조작을 공통 compact action menu로 통합하고, owner/viewer 및 390px 모바일 안전성을 정리. API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused workflow action e2e | `cd apps/web && npm run test:e2e -- --grep "상태 관리 액션\\|타입 관리 액션\\|모바일 워크플로우 액션"` | **PASS — 3** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 112** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/workflow-item-actions-ui/mobile.png` |

## UI-38 Notes

- Project workflow status rows now use a compact action menu for edit and reorder, while keeping fixed status keys non-destructive.
- Project work-item type rows now use the same action menu for edit, activate/deactivate, and reorder, replacing always-visible inline controls with a denser item-action pattern.
- Viewer/read-only state exposes a non-editable menu cue on mobile instead of hiding row affordances inconsistently.
- The shared `InlineActionMenu` is a OneFlow UI primitive using existing token classes and lucide icons; no Plane DOM/CSS/source/assets/packages were copied.
- No feature flag, environment variable, backend, database, migration, or API contract change.

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

---

# UI-first 재개발 UI-40 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-ai-workspace-ui`
> 범위: AI workspace/home summary surface 1차. `/my` workspace home 안에 AI capability 상태, 사용자 가시 작업 후보, 기존 work package detail AI 요약 진입을 연결. 기존 `/api/v1/capabilities`와 `/api/v1/work-packages/{id}/summary` 계약만 재사용하고 API/DB/env/migration 변경 없음.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused AI workspace e2e | `cd apps/web && npm run test:e2e -- --grep "내 작업 홈\|AI workspace\|AI 요약"` | **PASS — 3** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Backend lint/format | `make api-lint` | **PASS** |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Backend full tests | `make api-test` | **PASS — 513** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0060 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshots + manual inspection | **PASS** — `docs/screenshots/redevelopment/ai-workspace-ui/mobile.png`, updated `workspace-home/mobile.png` |

## UI-40 Notes

- `/my` now includes an AI workspace panel that reads the runtime `ai_summary_enabled` capability and scopes candidate counts to the current user's visible My Work data.
- Flag OFF does not expose `AI 요약 열기` or any generation action; it only shows the disabled state and a real system-status route.
- Flag ON selects an actual due/assigned/created work item candidate and deep-links to the existing work package drawer, where `AiSummarySection` performs the already-tested summary mutation.
- The E2E covers OFF state, ON state, drawer AI summary visibility, existing summary generation, 390x844 no-horizontal-overflow, and mobile screenshot QA.
- No feature flag default, environment variable, backend endpoint, database schema, migration, provider, model routing, external LLM, RAG, or background indexing change.
- Deferred intentionally: broad AI home commands, cross-resource RAG, provider secret wiring, and model selection UI. They need a later surface PR because this slice only exposes a working entry point to the existing scoped work-package summary capability.

---

# UI-first 재개발 UI-41 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-developer-security-ui`
> 범위: developer security/access token surface 1차. 개인 설정에 실제 사용 가능한 개발자 액세스 토큰 surface를 추가하고, 토큰 생성/목록/폐기, DB 해시 저장, Bearer 인증, 만료/폐기 차단, invalid bearer fallback 금지를 함께 구현. RSP-012의 developer/security 기능 요구 중 personal token slice를 흡수. Webhook delivery/audit surface는 별도 PR로 이연.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Focused developer security e2e | `cd apps/web && npm run test:e2e -- --grep "액세스 토큰\|개인 설정에서 알림"` | **PASS — 2** |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Playwright smoke | `make web-e2e` | **PASS — 111** |
| Backend lint/format | `make api-lint` | **PASS** |
| Focused token API tests | `cd apps/api && uv run pytest -q tests/test_access_tokens.py` | **PASS — 5** |
| Backend full tests | `make api-test` | **PASS — 518** (Alembic config deprecation warning 1건, 기존 경고) |
| OpenAPI 타입 드리프트 | `make check-types` | **PASS** |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0061 up/base/up** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/developer-security-ui/mobile.png` |

## UI-41 Notes

- `/settings` now includes a developer access token panel with real create/list/revoke flows, one-time raw token display, copied token action, active/revoked states, loading/error/empty states, and 390px mobile QA.
- Backend adds `personal_access_tokens` with SHA-256 token hash storage, short display prefix, expiration, revocation, and `last_used_at` update on successful Bearer authentication. Raw tokens are returned only by the create endpoint.
- Bearer token authentication works without an interactive session when `ONEFLOW_DEV_LOGIN_REQUIRED=true`; invalid, expired, or revoked Bearer tokens return 401 and never fall back to the dev user.
- Mutating token endpoints are registered in the permission report allowlist. The API surface remains user-scoped under `/api/v1/me/access-tokens`.
- `packages/shared/src/api-types.ts` was regenerated from the updated OpenAPI schema.
- No environment variable, external provider, OAuth client, webhook delivery, webhook signing, project secret vault, or background worker change in this PR. Webhooks and broader developer automation security are deferred to a follow-up developer-security surface PR.

---

# UI-first 재개발 UI-42 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-webhook-delivery-ui`
> 범위: developer webhook delivery/security surface. 관리자가 endpoint와 event 구독을 관리하고, 일회성 signing secret을 발급·회전하며, 실제 work package 생성/변경 이벤트를 전송·감사·재시도하는 사용 가능한 기능 단위로 구현. RSP-012의 webhook slice를 흡수.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Backend lint/format | `make api-lint` | **PASS** |
| Focused webhook/config/permission tests | `cd apps/api && uv run pytest -q tests/test_webhooks.py tests/test_config_guards.py tests/test_permission_report.py` | **PASS — 41** |
| Backend full tests (isolated DB) | `cd apps/api && ONEFLOW_TEST_DATABASE_URL=postgresql+asyncpg://oneflow:oneflow@localhost:5432/oneflow_webhook_test uv run pytest -q` | **PASS — 529** (Alembic config deprecation warning 1건, 기존 경고) |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0062 up/base/up** |
| OpenAPI 타입 생성/드리프트 | `make gen-types && make check-types` | **PASS** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Focused webhook e2e | `cd apps/web && npm run test:e2e -- --grep "webhook"` | **PASS — 2** |
| Playwright full regression | `cd apps/web && CI=true npm run test:e2e -- --reporter=line` | **PASS — 155** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/webhook-delivery-ui/mobile.png` |

## UI-42 UI 변경

- `/admin/webhooks`를 admin settings IA에 추가하고 endpoint 생성/편집/활성화/삭제, event 선택, 일회성 secret 복사/회전, 테스트 전송, delivery 감사·재시도를 실제 API에 연결했다.
- capability가 비활성일 때는 장식용 입력이나 실행 버튼을 노출하지 않고 설정 경계만 표시하며, non-admin은 403/read-only 상태로 처리한다.
- loading/error/empty/failure/success 상태와 390x844 모바일 overflow를 Playwright로 검증했다.

## UI-42 기능/API 반영

- `webhook_endpoints`와 `webhook_deliveries`를 migration 0062로 추가하고, 원문 secret을 저장하지 않는 versioned HMAC 파생 secret을 구현했다.
- endpoint URL은 HTTPS, 명시적 host/port allowlist, userinfo/fragment/IP literal 금지, DNS 공인 IP 확인을 통과해야 하며 redirect는 따르지 않는다.
- `work_package.created`와 `work_package.updated`를 commit 이후 background delivery에 연결하고 payload allowlist, signature headers, bounded timeout/error, pending cap, delivery audit/retry를 적용했다.
- 모든 쓰기 API는 workspace admin으로 제한하고 permission report allowlist에 등록했다. webhook 설정이 없으면 fail-closed 503으로 동작한다.
- `ONEFLOW_WEBHOOK_SIGNING_KEY`와 `ONEFLOW_WEBHOOK_ALLOWED_HOSTS`는 기본 비활성이다. 활성화에는 32자 이상의 signing key와 scheme/path 없는 정확한 host 또는 host:port allowlist가 필요하며 API 재시작이 필요하다.

## UI-42 이연 항목

- 별도 durable worker/queue, exponential backoff scheduler, delivery retention/purge, arbitrary event catalog, per-project endpoint scope는 이번 surface 밖이다.
- 현재 background task와 수동 retry는 감사 가능한 최소 기능 단위이며, 다중 인스턴스 내구성과 자동 재시도 정책은 후속 eventing/operations PR에서 확장한다.
- 최초 전체 API 실행은 다른 프로세스의 공유 `oneflow_test` TRUNCATE와 충돌해 unrelated fixture 실패가 발생했다. 전용 `oneflow_webhook_test` DB로 재실행해 529건 전체 PASS로 코드 회귀와 분리했다.

---

# UI-first 재개발 UI-43A 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-webhook-reliability-ui`
> 범위: webhook operations/reliability functional surface. UI-42의 post-commit enqueue와 복제형 retry를 transactional outbox, immutable event identity, database lease/recovery, bounded retry/dead-letter, same-delivery manual retry로 강화하고 admin audit에 운영 상태를 반영.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Backend lint/format | `make api-lint` | **PASS** |
| Focused webhook/write-fan-in regression | `cd apps/api && uv run pytest -q tests/test_webhooks.py tests/test_config_guards.py tests/test_wp_bulk_update.py tests/test_wp_duplicate.py tests/test_csv_io.py tests/test_intake.py tests/test_meetings.py tests/test_cycle_rollover.py tests/test_wp_move.py` | **PASS — 92** |
| Migration/model focused regression | `cd apps/api && ONEFLOW_TEST_DATABASE_URL=postgresql+asyncpg://oneflow:oneflow@localhost:5432/oneflow_webhook_test uv run pytest -q tests/test_constraint_names.py tests/test_webhooks.py` | **PASS — 23** |
| Backend full tests (isolated DB) | `cd apps/api && ONEFLOW_TEST_DATABASE_URL=postgresql+asyncpg://oneflow:oneflow@localhost:5432/oneflow_webhook_test uv run pytest -q` | **PASS — 542** |
| Migration smoke | `make api-migrate-smoke` | **PASS — 0001~0063 up/base/up** (중간 개발 0063 rollback 호환 및 canonical check name 수정 후 재검증) |
| OpenAPI 타입 생성/드리프트 | `make gen-types && make check-types` | **PASS** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 oxlint Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Focused webhook reliability e2e | `cd apps/web && npm run test:e2e -- --grep "webhook"` | **PASS — 4** |
| Playwright full regression | `cd apps/web && CI=true npm run test:e2e -- --reporter=line` | **PASS — 157** |
| Clean-room gate | `make cleanroom-check` | **PASS** |
| Security audit | `make audit` | **PASS** — pip-audit 0, npm audit high 0 |
| Whitespace gate | `git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/webhook-reliability-ui/mobile.png` |
| Independent review | Sol `reviewer` final targeted re-review | **APPROVED** — observer reset race 해소, blocking finding 없음 |

## UI-43A UI 변경

- Delivery audit가 `대기`, `전송 중`, `재시도 예정`, `성공`, `실패`, `처리 필요`, `건너뜀` 상태를 구분하고 다음 자동 시도 시각을 표시한다.
- 수동 재시도는 `실패`와 `처리 필요`에만 노출되며, 동일 delivery/event identity를 유지하는 실제 retry API에 연결된다.
- visible tab은 5초 polling과 수동 새로고침을 제공한다. 진행 중 retry observer는 유지하고 표시용 오류만 갱신해 refresh/retry 경합에서도 성공 callback과 상태 정리가 보장된다.
- retrying/dead-letter/success/unknown 상태, disabled capability, refresh와 in-flight retry 경합, 390x844 no-horizontal-overflow를 focused E2E 및 새 캡처로 확인했다.

## UI-43A 기능/API 반영

- Direct create/PATCH뿐 아니라 bulk update, duplicate, cross-project move와 child detach, CSV import, cycle rollover, intake acceptance, meeting action conversion의 work-package write fan-in도 endpoint별 outbox row를 도메인 변경과 같은 DB transaction에 기록한다. 커밋 후 즉시 전송은 direct create/PATCH의 최적화이며 lifespan worker의 due polling/lease recovery가 authoritative path다.
- Migration 0063은 `event_id`, `next_attempt_at`, `lease_owner`, `lease_token`, `leased_until`, `completed_at`, endpoint manual-rate window를 추가하고 endpoint/event uniqueness, canonical status check, due index를 강제한다.
- Worker는 `FOR UPDATE SKIP LOCKED`로 한 번에 한 행만 lease하고 bounded HTTP timeout보다 긴 lease 안에서 전송한다. 매 claim의 fencing token으로 만료 worker의 늦은 완료를 무시하고, 만료된 `sending` lease는 다른 worker가 회수한다.
- 보장은 durable audit와 bounded automatic attempts다. 자동 실패는 지수 지연의 `retrying`으로 이동하고 최대 시도에서 `dead_letter`가 된다. Pending saturation은 시도 0회의 operator-retryable `dead_letter`가 될 수 있다. 수동 retry는 같은 row를 잠그고 payload/event UUID를 바꾸지 않으며 concurrent sending은 409다. Consumer는 delivered attempt를 delivery ID와 event ID로 중복 제거해야 한다.
- 수동 test/retry 제한은 endpoint row lock과 1분 DB window counter로 강제한다. Worker cancellation은 lease를 남겨 다음 startup에서 복구되도록 한다.
- 첫 migration smoke는 브랜치 중간 0063의 누락 check/lease-token 스키마 때문에 rollback이 실패했다. 0063 downgrade를 `IF EXISTS` 호환으로 바꾸고 모델 check의 논리 이름을 canonical convention에 맞춘 뒤 up/base/up을 통과했다. 첫 전체 API 실행의 17건 실패도 같은 stale 전용 DB에서 파생됐으며, 전용 DB를 base/up으로 재구성한 후 focused 23과 전체 542가 모두 통과했다.

## UI-43A 이연 항목

- DNS 검증 결과와 실제 TLS socket 연결을 같은 IP에 pinning하는 transport, signing master-key identifier/key-ring rotation/rollback은 UI-43B transport-security surface로 명시 이연한다.
- 별도 외부 queue/service, 운영 retention/purge, event catalog 확장은 현재 필요하지 않아 이 PR에 포함하지 않는다.

---

# UI-first 재개발 UI-43B 검증 (2026-07-10 · B-030)

> 브랜치: `feature/redevelopment-webhook-transport-security-ui`
> 범위: webhook transport/key security functional surface. DNS 검증 결과를 실제 TLS socket에 pinning하고 signing key ID/version snapshot, 회전 감사, 누락 키 복구 UI를 완결한다.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Backend lint/format | `make api-lint` | **PASS — 293 files** |
| Focused webhook/config/constraint | `pytest tests/test_config_guards.py tests/test_constraint_names.py tests/test_webhooks.py` | **PASS — 61** |
| Backend full tests (isolated DB) | `ONEFLOW_TEST_DATABASE_URL=.../oneflow_webhook_test pytest -q` | **PASS — 557** |
| Migration smoke | 0064 non-legacy guard + `0064→0063→0064→base→0064` | **PASS** |
| OpenAPI 타입 생성/드리프트 | `make gen-types && make check-types` | **PASS** |
| Frontend typecheck/lint/build | `make web-build` | **PASS** (기존 Fast Refresh 경고 3건, Vite chunk 경고) |
| Frontend unit | `make web-unit` | **PASS — 62** |
| Focused webhook E2E | `npm run test:e2e -- --grep webhook` | **PASS — 5** |
| Playwright full regression | `CI=true npm run test:e2e -- --reporter=line` | **PASS — 158** |
| Real TLS fixture | local CA/server + literal dial/original SNI/Host | **PASS** |
| Clean-room / audit / diff | `make cleanroom-check && make audit && git diff --check` | **PASS** |
| Visual QA | Playwright screenshot + manual inspection | **PASS** — `docs/screenshots/redevelopment/webhook-transport-security-ui/mobile.png` |
| Independent security re-review | Sol `reviewer` targeted closure review | **APPROVED** — P0/P1 및 significant P2 없음 |

## UI-43B UI 변경

- Admin webhook surface가 active/configured signing key ID, endpoint key/version, delivery snapshot, 최근 rotation reason/history를 표시한다.
- Secret 회전은 target key, expected version, 사유를 실제 CAS API로 전송하며 성공 secret은 한 번만 표시한다. 409는 최신 endpoint를 자동 재조회하고 같은 폼에서 재시도할 수 있다.
- 제거된 historical key를 쓰는 endpoint는 경고를 표시하고 configured key 중 첫 값을 실제 select value로 선택해 복구 회전을 보낸다.
- 0064 이전 delivery는 현재 endpoint key/version을 소급한 값임을 `migration estimate`로 표시하며 captured snapshot과 혼동하지 않는다.

## UI-43B 기능/API 반영

- URL은 exact HTTPS allowlist, DNS 2초 제한, 모든 응답의 public-address 검사를 통과해야 한다. IPv4 literal, private/special 주소, mixed public/private 응답, IPv4-mapped/6to4/Teredo/NAT64 전환 주소는 거부한다.
- 검증된 최대 8개 IP 후보에만 literal dial하며 원래 authority를 `Host`, 원래 hostname을 TLS SNI/certificate name으로 유지한다. Proxy 환경은 무시하고 redirect/HTTP2를 끄며 총 8초 deadline 안에서 connect 오류에만 후보 failover한다.
- Receiver는 `x-oneflow-key-id`와 `x-oneflow-secret-version`으로 snapshot secret을 선택하고 `x-oneflow-timestamp + '.' + raw body` HMAC을 검증해야 한다. Delivery/event ID 중복 제거 계약은 UI-43A와 동일하다.
- Signing master keys는 `SecretStr`로 보관하고 validation input은 오류에서 숨긴다. Key material은 API/감사/UI에 직렬화하지 않는다.
- Endpoint와 delivery는 key ID/version을 snapshot한다. 누락된 historical key는 DNS/socket 전에 `signing_key_unavailable:<id>`로 fail closed하고, 운영자가 key를 복구한 뒤 같은 delivery를 수동 재시도할 수 있다.
- Migration 0064는 pre-0064 writer INSERT를 위한 endpoint default와 delivery snapshot trigger를 둔다. 다만 pinned transport 보장을 위해 모든 0063 API/worker를 drain한 뒤 non-legacy active key를 켜야 한다. 네트워크 egress firewall은 application validation과 별도로 유지한다.
- 0064 downgrade는 endpoint 또는 delivery에 non-legacy key snapshot이 하나라도 있으면 명시적으로 거부한다. 먼저 endpoint를 legacy key로 회전하고 non-legacy pending/history 보존 정책을 처리해야 한다.

## UI-43B 이연 항목

- KMS/HSM provider, key retirement 자동 참조-count UI, delivery retention/purge는 별도 운영 확장으로 남긴다. 현재 key ring은 deployment secret store가 공급하며 설정 변경에는 재시작이 필요하다.

---

# UI-44 Personal Notes 검증 (2026-07-10 · B-030)

> 범위: owner-only personal notes CRUD, pin/order/version conflict API와 `/notes`·sidebar/topbar·`/my` entry surface.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Backend lint/format | `make api-lint` | **PASS — 299 files** |
| Focused API/permission/constraint | `uv run pytest -q tests/test_personal_notes.py tests/test_permission_report.py tests/test_constraint_names.py` | **PASS — 16** |
| Backend full regression | `cd apps/api && uv run pytest -q` | **PASS — 563** |
| Migration smoke | test DB `head → base → head` (0001~0066) | **PASS** |
| OpenAPI type generation/drift | `make gen-types && make check-types` | **PASS** |
| Frontend typecheck/lint/build | `cd apps/web && npm run typecheck && npm run lint && npm run build` | **PASS** (existing Fast Refresh warnings 3) |
| Frontend unit | `cd apps/web && npm run test:unit` | **PASS — 63** |
| Focused Playwright | `npm run test:e2e -- --grep "개인 메모|사용자 전환 로그인"` | **PASS — 4** |
| Playwright full regression | `CI=true npm run test:e2e -- --reporter=line` | **PASS — 162** |
| Clean-room / dependency audit / diff | `make cleanroom-check`, `make audit`, `git diff --check` | **PASS** |
| Responsive visual QA | Playwright screenshot + manual inspection | **PASS** — desktop 1280x720, mobile 390x844 |
| Independent critical review | Sol reviewer initial + two closure passes | **APPROVED** — identity cache, OpenAPI errors, evidence, retry recovery, reorder bound, 44px targets closed; P0/P1/P2 0 |

## UI-44 UI 변경

- `/notes`에 제목 검색, plain-text composer, pin, 같은 pin group 내 순서 이동, 편집·삭제, empty/loading/error/conflict 상태를 배치했다.
- sidebar/topbar와 `/my` 개인 메모 3건 요약·추가 진입을 연결하고 44px row action target과 desktop/mobile overflow를 검증했다.
- 409 편집 충돌은 초안을 보존한 채 최신 내용 불러오기 또는 최신 version으로 명시적 재저장을 선택한다.

## UI-44 기능/API 반영

- migration 0066과 owner-only CRUD/search/pin/full-set reorder API를 추가했다. 모든 resource query/write는 `user_id`를 포함하며 admin도 다른 사용자 메모를 볼 수 없다.
- PATCH/DELETE/reorder는 version CAS, create/pin/reorder/delete는 per-user advisory transaction lock을 사용한다. 200개 상한과 reorder payload 상한을 동일하게 강제한다.
- cap 409, version 409, lock-timeout 503을 OpenAPI에 선언하고 generated TypeScript contract와 drift gate를 동기화했다.
- 로그인 identity 전환 시 React Query cache를 즉시 clear해 이전 사용자의 개인 메모·개인 데이터가 새 사용자 fetch 중 렌더링되지 않게 했다. unit과 delayed-response E2E로 회귀를 검증했다.

## UI-44 계약 메모

- 메모는 `user_id` owner boundary이며 다른 사용자 메모는 존재 여부를 드러내지 않고 404다. 본문은 plain text만 저장·렌더링한다.
- create/pin change/reorder/delete는 같은 user-specific advisory xact lock을 사용한다. create는 pin group 끝에 추가하고 max 200을 같은 lock 안에서 확인한다.
- PATCH/DELETE는 `expected_version` CAS이며 stale write는 current note를 포함한 409을 돌려 draft-preserving UI가 최신 불러오기 또는 명시적 overwrite 재시도를 선택한다.
- reorder는 전체 owner set과 각 expected version을 정확히 요구하며, pinned notes가 먼저 오는 contract로 각 group position을 0부터 정규화한다.

## UI-44 이연 항목

- rich text, 공유 메모, 협업 댓글, 프로젝트 연결은 RSP-014의 개인 sticky 범위를 넘어 이연한다. 현재 surface에는 해당 기능을 암시하는 미배선 control이 없다.
- 환경변수·feature flag 변경 없음. 설정 UI 반영과 재기동은 필요하지 않다.

---

# UI-50 Wiki Policy 검증 (2026-07-11 · B-030)

> 범위: D047 workspace Wiki 활성화 정책, 관리자 CAS 설정, 실제 documents/navigation/search/attachment 집행과 disable 데이터 보존.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Backend lint/format | `make api-lint` | **PASS — 320 files** |
| Focused API/docs/attachment/search/permission | `uv run pytest -q tests/test_workspace_features.py ... tests/test_permission_report.py` | **PASS — 52** |
| Backend full regression | `cd apps/api && uv run pytest -q` | **PASS — 601** |
| Migration smoke | test DB `head → base → head` (0001~0070) | **PASS** |
| OpenAPI generation/drift | `make gen-types && make check-types` | **PASS** |
| Frontend lint/typecheck/build | `npm run lint`, `npm run typecheck`, `npm run build` | **PASS** (기존 Fast Refresh 경고 3, chunk size 경고) |
| Frontend unit/component | `npm run test:unit`, `npm run test:component` | **PASS — 64 / 4** |
| Playwright full regression | `npm run test:e2e` | **PASS — 184** |
| Final focused Wiki E2E | `npm run test:e2e -- --grep 'Wiki 설정'` | **PASS — 4** |
| Clean-room / dependency audit / diff | `make cleanroom-check`, `make audit`, `git diff --check` | **PASS** |
| Responsive visual QA | Playwright screenshot + manual inspection | **PASS** — desktop documents restored, mobile admin settings |
| Independent closure review | Native Sol reviewer, two P2 repair rounds | **APPROVED** — weak ETag strict parsing, cache eviction regression, stray lockfile closed |

## UI-50 UI 변경

- `/admin/wiki`에 workspace-admin 전용 Wiki toggle, revision, 변경자/변경 시각, loading/error/403/stale-CAS 상태를 추가했다.
- capability가 꺼지면 project Documents navigation, work-item Pages section, Files의 document anchor, Search 문서 그룹/요약, Command Palette 문서 tab/result가 즉시 숨겨진다.
- 직접 문서 URL은 child query를 mount하지 않고 명시적 비활성 상태를 표시하며, 재활성화 후 기존 문서가 그대로 복구된다.

## UI-50 기능/API 반영

- migration 0070의 singleton `workspace_feature_policies`가 Wiki를 기본 활성화하고 revision, actor snapshot, timestamp를 보존한다.
- 인증 사용자 capability GET과 admin GET/PATCH를 추가했다. PATCH는 `If-Match` revision CAS로 missing 428, malformed 422, stale 412+ETag를 반환하며 동시 writer 한 명만 성공한다.
- Wiki OFF에서 documents router 전체와 document-anchored attachment create/upload를 structured 403으로 차단한다. 일반 파일과 기존 attachment cleanup은 유지하고 unified search는 문서 group만 빈 결과로 만든다.
- disable은 문서/링크/댓글/첨부 데이터를 삭제하지 않으며 re-enable 후 같은 데이터가 다시 조회된다. 환경변수·재기동은 필요 없다.

## UI-50 이연 항목

- 없음. D047의 관찰된 단일 Wiki 활성화 surface를 실제 정책·권한·API·상태·responsive UX까지 완결했으며 미배선 control은 없다.

---

# UI-51 Data Transfers 검증 (2026-07-11 · B-030)

> 범위: D037-D038/RSP-008 CSV/Jira/Linear import/export의 durable job audit, 불변 export artifact와 Operations history surface.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Backend lint/format | `make api-lint` | **PASS** |
| Focused transfer/CSV/adapter/permission/storage | `uv run pytest -q tests/test_data_transfers.py ... tests/test_storage_sweep.py` | **PASS — 49**, final transfer closure **12** |
| Backend full regression | `cd apps/api && uv run pytest -q` | **PASS — 613** |
| Migration smoke | `make api-migrate-smoke` (0001~0071) | **PASS** |
| OpenAPI generation/drift | `make gen-types`, `make check-types` | **PASS** |
| Frontend lint/typecheck/build | `make web-build` | **PASS** (기존 Fast Refresh 경고 3, chunk size 경고) |
| Frontend unit/component | `npm run test:unit`, `npm run test:component` | **PASS — 64 / 4** |
| Playwright full regression | `npm run test:e2e` | **PASS — 184** |
| Final focused transfer E2E | `npm exec -- playwright test -g '운영 허브는 데이터 이전'` | **PASS — 1** |
| Clean-room / dependency audit / diff | `make cleanroom-check`, `make audit`, `git diff --check` | **PASS** |
| Responsive visual QA | Playwright screenshot + manual inspection | **PASS** — desktop 1280x720, mobile 390x844 |
| Independent closure review | Native Sol reviewer | **APPROVED** — partial-download/history P1과 retention delivery race P2 수정 확인 |

## UI-51 UI 변경

- `/operations`에서 프로젝트별 CSV 가져오기와 내보내기를 유지하면서 최근 데이터 이전 이력, 프로젝트 필터, actor/time, source/direction, total/valid/error/inserted 건수와 checksum을 스캔할 수 있게 했다.
- 내보내기는 작업 생성 후 고정된 artifact를 즉시 받고, 과거 이력에서 같은 파일을 다시 받을 수 있다. 생성 성공 후 자동 다운로드만 실패하면 작업 실패로 오인하지 않고 이력 재다운로드 경로를 안내한다.
- empty/loading/error 상태와 390px 반응형 흐름을 배선했으며 모든 버튼과 필터는 실제 API 요청에 연결된다.

## UI-51 기능/API 반영

- migration 0071 `data_transfer_jobs`가 프로젝트/actor snapshot, direction/source/dry-run/status, 대사 건수, canonical checksum, bounded errors/notes, artifact metadata/SHA-256를 보존한다.
- OneFlow/Jira/Linear dry-run과 apply는 작업 결과와 같은 transaction에 job을 기록한다. apply job 저장 실패 시 생성 work item도 rollback한다.
- 기존 GET CSV export는 부작용 없는 호환 경로로 유지하고, POST export job만 정확한 CSV bytes를 LocalStorage에 원자 저장한 뒤 audit row를 만든다. DB 실패 시 신규 파일을 보상 삭제한다.
- history와 artifact download는 현재 project member에게만 노출하고 비회원은 404로 숨긴다. 최대 100건/project를 advisory lock 아래 유지하며 제거된 export artifact도 정리한다. storage sweep live-key 집합에 transfer artifacts를 포함한다.
- 다운로드는 최대 10 MiB로 생성 시 제한된 파일을 한 번 읽어 SHA-256 검증한 동일 bytes로 응답하므로 integrity check와 전송 사이 retention race가 없다.

## UI-51 이연 항목

- D033 live integrations는 외부 시스템 credential/secret과 실제 연결 대상 없이는 연결·검증·동기화 control을 기능형으로 완결할 수 없어 별도 credential-backed surface로 이연한다. 이 PR에는 mock connection이나 dead control을 추가하지 않았다.
- Object storage/S3와 장기 archive retention은 현재 LocalStorage 배포 정책 밖의 운영 확장이다. 현 계약은 최근 100건과 10 MiB artifact, 기존 storage backup/sweep 정책을 따른다.
- 환경변수·feature flag 변경 없음. 설정 UI 반영과 재기동은 필요하지 않다.

---

# UI-52 Wiki Lifecycle 검증 (2026-07-11 · B-030)

> 범위: D005/D028-D030/RSP-009 shared/private/archived Wiki bucket, author/member visibility, archive/restore CAS와 파생 표면 privacy.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Backend lint/format | `make api-lint` | **PASS** |
| Focused lifecycle/attachment/move privacy | `uv run pytest -q tests/test_document_lifecycle.py tests/test_attachments.py tests/test_wp_move.py` | **PASS — 18** |
| Backend full regression | `cd apps/api && uv run pytest -q` | **PASS — 619** |
| Migration smoke | `make api-migrate-smoke` (0001~0072) | **PASS** |
| OpenAPI generation/drift | `make gen-types`, `make check-types` | **PASS** |
| Frontend lint/typecheck/build | `npm run lint`, `npm run typecheck`, `npm run build` | **PASS** (기존 Fast Refresh 경고 3, chunk size 경고) |
| Frontend unit/component | `npm run test:unit`, `npm run test:component` | **PASS — 64 / 4** |
| Playwright full regression | `npm run test:e2e` | **PASS — 185** |
| Clean-room / dependency audit / diff | `make cleanroom-check`, `make audit`, `git diff --check` | **PASS** |
| Responsive visual QA | Playwright screenshot + manual inspection | **PASS** — mobile 390x844 archived detail |
| Independent closure review | Native Sol reviewer | **APPROVED** — non-author edit regression, move summary and storage aggregate privacy findings closed |

## UI-52 UI 변경

- `/projects/:projectId/documents`를 공유/비공개/보관됨 URL bucket으로 재구성하고, 현재 bucket에 맞는 실제 생성·empty/loading/list 상태를 연결했다.
- 작성자는 공개 범위를 변경할 수 있고, 작성자 또는 project owner는 version 기반 보관·복원을 실행한다. 보관 문서는 제목·본문·댓글·링크·첨부가 읽기 전용이며 CAS 충돌은 최신 version으로 명시 재시도할 수 있다.
- 모바일 390px에서 bucket 탐색, private 생성, archive read-only detail과 restore를 실제 요청으로 검증했다. 미배선 control은 없다.

## UI-52 기능/API 반영

- migration 0072가 `visibility`, archive timestamp와 actor snapshot을 추가한다. shared active, author-only private active, visible archived bucket을 SQL에서 분리하고 hierarchy는 같은 visibility의 active parent만 허용한다.
- private 문서는 admin/project owner 우회 없이 작성자에게만 보이며, shared lifecycle은 작성자 또는 project owner만 수행한다. 일반 편집·댓글·링크·첨부 변경은 archived 상태에서 409로 차단한다.
- unified search, work-package document reverse lookup, move preview, attachment list/download/delete와 사용자 표시 storage aggregate를 같은 visibility 경계로 필터링한다. 업로드 quota는 프로젝트 전체 실제 bytes를 계속 집계한다.
- private 문서를 소유한 사용자의 project membership 제거는 409로 막아 orphan private content를 방지한다. 공유 전환 또는 삭제 후 offboarding할 수 있다.
- OpenAPI generated types와 permission report를 동기화했다. 환경변수·feature flag 변경, 설정 UI와 재기동은 없다.

## UI-52 이연 항목

- 문서별 immutable lifecycle event history는 현재 요구의 current-state actor snapshot을 넘어서는 감사 확장으로 이연한다. 현재 화면에는 history가 있는 것처럼 보이는 control을 두지 않았다.

---

# UI-53 AI Workspace Policy 검증 (2026-07-11 · B-030)

> 범위: D034 AI feature settings, deployment hard ceiling + workspace DB policy, admin CAS/audit, effective capability와 summary endpoint 집행.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Backend lint/format | `make api-lint` | **PASS** |
| Focused AI/policy/permission/regression | `uv run pytest -q tests/test_users_admin.py tests/test_assignment_history.py tests/test_ai.py tests/test_workspace_features.py tests/test_permission_report.py tests/test_constraint_names.py` | **PASS — 33** |
| Backend full regression | `cd apps/api && uv run pytest -q` | **PASS — 621** |
| Migration smoke | `make api-migrate-smoke` (0001~0073) | **PASS** |
| OpenAPI generation/drift | `make gen-types`, `make check-types` | **PASS** |
| Frontend lint/typecheck/build | `npm run lint`, `npm run typecheck`, `npm run build` | **PASS** (기존 Fast Refresh 경고 3, chunk size 경고) |
| Frontend unit/component | `npm run test:unit`, `npm run test:component` | **PASS — 65 / 4** |
| Playwright focused/full | `npm exec -- playwright test -g 'AI workspace 정책'`, `npm run test:e2e` | **PASS — 4 / 189** |
| Clean-room / dependency audit / diff | `make cleanroom-check`, `make audit`, `git diff --check` | **PASS** |
| Responsive visual QA | Playwright screenshot + manual inspection | **PASS** — mobile 390x844 admin AI settings |
| Independent security review | Native Sol deep-reasoner + reviewer closure | **APPROVED** — dual gate, fail-closed defaults, capability cache preservation |

## UI-53 UI 변경

- `/admin/ai`에 workspace-admin 전용 정책 toggle, effective/deployment 상태, revision, 변경자/시간, loading/error/403/stale-CAS 상태를 추가했다.
- 배포 상한이 OFF면 switch를 비활성화하고 운영 설정·재기동 필요를 명시한다. 상한이 ON일 때 정책 변경은 `/my`와 작업 상세의 실제 AI 요약 진입점에 즉시 반영된다.
- sidebar/topbar route context와 390px responsive surface를 연결했으며 모든 control은 실제 API에 배선된다.

## UI-53 기능/API 반영

- migration 0073이 `workspace_feature_policies`에 fail-closed AI 행을 추가하고 allowed-key constraint와 DB default를 reversible하게 확장한다.
- effective capability는 엄격한 `ONEFLOW_AI_SUMMARY=true` 배포 상한과 DB `ai.enabled`가 모두 참일 때만 켜진다. 배포 상한 OFF에서 enable PATCH는 409이며 summary endpoint도 같은 이중 게이트를 서버에서 재검사한다.
- admin GET/PATCH는 strong ETag revision CAS, stale 412, actor snapshot을 제공하고 비관리자는 403이다. 정책 행에는 작업 내용이나 요약 결과를 기록하지 않는다.
- Wiki/AI workspace capability cache는 한 정책 변경이 다른 정책 상태를 덮어쓰지 않도록 병합하며 별도 AI capability cache도 즉시 동기화한다.

## UI-53 이연 항목

- 외부 LLM provider, API key, RAG/indexing, prompt 관리와 생성 결과 감사는 D034의 현재 local summary 정책 범위를 넘어 이연한다. 화면에는 연결되지 않은 provider 선택이나 credential control을 두지 않았다.
- 기존 환경변수 의미를 배포 hard ceiling으로 명확히 했으며 새 환경변수는 없다. `ONEFLOW_AI_SUMMARY` 변경은 재기동이 필요하고 runtime 정책은 관리자 UI에서 조정한다.

---

# UI-54 Initiatives Workspace Policy 검증 (2026-07-11 · B-030)

> 범위: D045 Initiatives feature policy, workspace-admin CAS 설정, 실제 initiative API/navigation/search/project rollup 집행과 disable 데이터 보존.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Backend lint/format | `uv run ruff check ... --fix`, `uv run ruff format ...` | **PASS** |
| Focused initiative/policy/search/project/permission | `uv run pytest -q tests/test_initiatives_policy.py ... tests/test_constraint_names.py` | **PASS — 43** |
| Backend full regression | `make api-test` | **PASS — 623** |
| Migration smoke | `make api-migrate-smoke` (0001~0074) | **PASS** |
| OpenAPI generation/drift | `make gen-types && make check-types` | **PASS** |
| Frontend lint/typecheck/build | `make web-build` | **PASS** (기존 Fast Refresh 경고 3, chunk size 경고) |
| Frontend unit/component | `make web-unit`, `npm run test:component` | **PASS — 66 / 4** |
| Playwright full/final focused | `make web-e2e`, policy closure grep | **PASS — 192 / 1** |
| Clean-room / dependency audit / diff | `make cleanroom-check`, `make audit`, `git diff --check` | **PASS** |
| Responsive visual QA | Playwright screenshot + manual inspection | **PASS** — mobile 390x844 admin Initiatives settings |
| Independent security review | Native Sol deep-reasoner + reviewer closure | **APPROVED** — Reporting navigation OFF-state 우회 수정 후 재검토 |

## UI-54 UI 변경

- `/admin/initiatives`에 workspace-admin 전용 정책 toggle, revision, 변경자/시간, loading/error/403/stale-CAS 상태를 추가했다.
- 정책 OFF는 sidebar와 Reporting navigation의 Initiatives 진입점, Search와 Command Palette의 initiative 그룹/탭, 프로젝트 디렉터리의 initiative 요약·열·링크를 즉시 숨긴다.
- 직접 `/initiatives` 접근은 child query를 실행하지 않고 비활성 상태를 표시한다. 정책 관리 화면은 기능 OFF 중에도 관리자가 다시 활성화할 수 있도록 유지한다.

## UI-54 기능/API 반영

- migration 0074가 `workspace_feature_policies`의 allowed key를 `wiki`, `ai`, `initiatives`로 확장하고 기존 workspace에는 Initiatives를 기본 활성화한다. downgrade는 정책 행을 제거하고 이전 constraint를 복원한다.
- 인증 사용자 capability와 admin GET/PATCH를 확장했다. PATCH는 strong `If-Match` revision CAS로 missing 428, malformed 422, stale 412+ETag를 반환하고 actor snapshot을 보존한다.
- 정책 OFF에서 initiatives router의 read/write/link lifecycle 전체는 404로 존재를 숨긴다. unified search는 initiative group만 빈 결과로 만들고 프로젝트 목록은 initiative rollup만 생략하며 일반 작업·멤버 집계는 그대로 유지한다.
- disable은 initiative와 project link 데이터를 삭제하지 않으며 re-enable 후 같은 데이터와 연결이 복구된다. capability 변경은 initiatives/projects/search/palette cache를 무효화하면서 Wiki·AI sibling capability를 보존한다.

## UI-54 이연 항목

- D045의 Initiative labels taxonomy는 현재 label model/API가 없어 model-backed 별도 surface로 이연한다. 이 PR에는 가짜 label이나 미배선 control을 추가하지 않았다.
- D046 Releases는 기존 milestones와의 제품 명칭·정보구조 매핑을 먼저 확정해야 하므로 별도 UI-first surface로 추적한다.
- 환경변수·feature flag 추가 없음. 설정 UI는 DB runtime policy이며 재기동이 필요하지 않다.

---

# UI-55 Releases Workspace Policy 검증 (2026-07-11 · B-030)

> 범위: D046 Releases feature policy, OneFlow milestone 대응 기능의 admin CAS 설정, API/work-item/saved-view/timeline 집행과 disable 데이터 보존.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Backend lint/format | `make api-lint` | **PASS — 334 files** |
| Focused release/milestone/work/view/report/permission | `uv run pytest -q tests/test_releases_policy.py ... tests/test_constraint_names.py` | **PASS — 65** |
| Backend full regression | `make api-test` | **PASS — 625** |
| Migration smoke | `make api-migrate-smoke` (0001~0075) | **PASS** |
| OpenAPI generation/drift | `make gen-types && make check-types` | **PASS** |
| Frontend lint/typecheck/build | `make web-build` | **PASS** (기존 Fast Refresh 경고 3, chunk size 경고) |
| Frontend unit/component | `make web-unit`, `npm run test:component` | **PASS — 67 / 4** |
| Playwright focused/full/failure closure | policy 3, full suite, settings closure 11 | **PASS — 3 / 195 / 11** |
| Clean-room / dependency audit / diff | `make cleanroom-check`, `make audit`, `git diff --check` | **PASS** |
| Responsive visual QA | Playwright screenshot + manual inspection | **PASS** — mobile 390x844 admin Releases settings |
| Independent security review | Native Sol deep-reasoner + reviewer repair/closure | **APPROVED** — write serialization, move response, pending URL, cache findings closed |

## UI-55 UI 변경

- `/admin/releases`에 workspace-admin 전용 정책 toggle, revision, 변경자/시간, loading/error/403/stale-CAS 상태를 추가했다.
- 정책 OFF는 project settings의 마일스톤 탭과 direct query, work-item 상세의 마일스톤 속성, 목록 필터와 stale URL, timeline의 마일스톤 지표/marker를 제거한다.
- capability 확인 실패는 일반 project settings를 막지 않고 Releases surface만 fail-closed 처리한다. 정책 변경 시 milestone/work-package/saved-view/portfolio cache를 즉시 제거한다.

## UI-55 기능/API 반영

- migration 0075가 allowed key를 `wiki`, `ai`, `initiatives`, `releases`로 확장하고 backward-compatible `releases=true` 정책을 삽입한다. downgrade는 행 삭제 후 0074 constraint를 복원한다.
- admin GET/PATCH는 strong `If-Match` revision CAS, 428/422/412+ETag와 actor snapshot을 제공한다. 비관리자는 403이다.
- OFF에서 milestones CRUD와 명시적 work-item milestone create/patch/filter, milestone saved-view create/update/delete, cross-project move는 404다. 일반 work-item read는 `milestone_id=null`, duplicate는 hidden FK를 복사하지 않고 portfolio timeline은 milestone rows를 생략한다.
- 정책 row `SELECT FOR UPDATE`를 milestone/FK/view 쓰기 transaction과 공유해 OFF 전환과 경쟁하는 ON 기반 쓰기를 직렬화한다. linked/unassigned move는 OFF에서 같은 404이고, disable은 기존 milestone, work-item FK, saved view를 삭제하지 않으며 re-enable 후 복구한다.

## UI-55 이연 항목

- OneFlow 내부 도메인/DB 이름은 호환성을 위해 `milestone`을 유지하고 사용자-facing workspace 정책만 Releases로 매핑한다. 전면 rename migration은 가치 없이 위험만 커 별도 수행하지 않는다.
- 픽셀 단위 trade-dress 복제와 부하 테스트는 이 surface 범위 밖이다. 미배선 control은 없다.
- 환경변수·feature flag 추가 없음. 설정 UI는 DB runtime policy이며 재기동이 필요하지 않다.

---

# UI-59 Identity & Sessions 검증 (2026-07-11 · B-030)

> 범위: D035 인증 배포 경계와 로컬 쿠키 인증 환경의 실제 사용자 활성 세션 조회·해지 workflow.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Backend lint/format | `uv run ruff check app tests`, `uv run ruff format --check app tests` | **PASS — 262 files** |
| Focused auth/session | `uv run pytest tests/test_auth_config.py tests/test_dev_login.py -q` | **PASS — 16** |
| Backend full regression | `uv run pytest -q` | **PASS — 633** |
| OpenAPI generation/drift | `make gen-types && make check-types` | **PASS** |
| Frontend typecheck/lint/build | `npm run typecheck`, `npm run lint -- --quiet`, `npm run build` | **PASS** (기존 chunk size 경고) |
| Frontend unit/component | `npm run test:unit`, `npm run test:component` | **PASS — 67 / 4** |
| Playwright focused/full | identity/session grep, `npm run test:e2e` | **PASS — 2 / 200** |
| Clean-room / dependency audit / diff | `make cleanroom-check`, `make audit`, `git diff --check` | **PASS** |
| Responsive visual QA | Playwright screenshot + manual inspection | **PASS** — mobile 390x844 personal security settings |
| Independent security review | Sol reviewer repair/closure | **APPROVED** — owner isolation, auth-mode boundary, Origin/Referer guard, retry behavior |

## UI-59 UI 변경

- 개인 설정의 임시 로그아웃 설명을 인증 모드별 Identity & Sessions surface로 교체했다.
- 쿠키 세션 모드에서는 현재/다른 활성 세션, 시작·만료 시각과 실제 종료 동작을 제공한다. 다른 세션 종료는 목록을 갱신하고 현재 세션 종료는 캐시를 비운 뒤 로그인으로 이동한다.
- 자동 개발 로그인과 OIDC는 지원하지 않는 종료 버튼을 숨기고 각각 로컬 자동 로그인 경계와 issuer/client ID 배포 경계를 표시한다. loading/error/retry와 390px 모바일 상태를 포함한다.

## UI-59 기능/API 반영

- 공개 auth config에 `session_management_enabled` capability를 추가했다. `ONEFLOW_DEV_LOGIN_REQUIRED=true`인 dev cookie 인증에서만 참이다.
- `GET /api/v1/me/sessions`는 현재 쿠키 사용자 소유의 unexpired/unrevoked 세션만 `{id, created_at, expires_at, is_current}`로 반환하며 `Cache-Control: no-store`를 적용한다.
- `DELETE /api/v1/me/sessions/{id}`는 owner-scoped, foreign/missing/repeated 존재 은닉 204, current cookie 삭제를 제공한다. PAT/bearer는 세션 열람·종료 권한이 없고 mutation은 허용 Origin 또는 Referer를 검증한다.
- migration과 새 환경변수는 없다. 기존 raw cookie token과 저장된 hash는 응답·UI에 노출되지 않는다.

## UI-59 이연 항목

- OIDC 세션 목록·global logout·provider revoke는 실제 OIDC authorization flow와 공급자 계약이 없어 배포/IdP 경계로 이연한다. 미배선 provider control은 추가하지 않았다.
- IP, user-agent, device 이름은 별도 개인정보 수집·보존 정책과 migration이 필요해 현재 최소 세션 메타데이터에서 제외했다.

---

# UI-60 Workspace General Settings 검증 (2026-07-11 · B-030)

> 범위: D007 workspace identity update를 singleton DB profile, admin CAS, app/settings shell 소비 경로와 responsive settings로 통합.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Backend lint/format | `make api-lint` | **PASS — 343 files** |
| Focused profile/permission/constraint | workspace profile + permission report + constraint tests | **PASS — 13** |
| Backend full regression | `uv run pytest -q` | **PASS — 636** |
| Migration smoke | `make api-migrate-smoke` (0001~0077 down/up) | **PASS** |
| OpenAPI generation/drift | `make gen-types && make check-types` | **PASS** |
| Frontend typecheck/lint/build | npm typecheck/lint/build | **PASS** (기존 chunk size 경고) |
| Frontend unit/component | npm unit/component | **PASS — 67 / 4** |
| Playwright full/closure | full suite, workspace/admin focused closure | **200 / 201 PASS 후 index redirect 회귀 수정, focused 4 PASS** |
| Clean-room / dependency audit / diff | cleanroom, audit, `git diff --check` | **PASS** |
| Responsive visual QA | Playwright screenshot + manual inspection | **PASS** — mobile 390x844 settings + app drawer identity |
| Independent review | Sol reviewer repair/closure | **APPROVED** — query cancellation, stale refresh gating, draft preservation |

## UI-60 UI 변경

- Workspace Settings Administration 그룹에 `/admin/general`을 추가하고 이름 편집, 즉시 preview, revision/변경자/시각, loading/error/stale retry 상태를 제공한다.
- 저장된 이름은 settings shell subtitle과 전체 앱 sidebar workspace identity에 같은 React Query cache로 즉시 반영된다. 기존 `/admin`→Users 기본 경로와 비관리자 fail-closed 동작은 보존한다.
- 390px에서 settings horizontal navigation, form, 모바일 app drawer가 overflow 없이 동작하며 모든 버튼은 실제 PATCH/reset 동작에 연결된다.

## UI-60 기능/API 반영

- migration 0077이 singleton `workspace_profiles`를 기본 이름 `OneFlow`, positive revision, non-blank trimmed name, actor snapshot 제약과 함께 추가한다.
- authenticated `GET /workspace/profile`은 shell에 필요한 name/revision만 반환한다. admin `GET/PATCH /admin/workspace/profile`은 audit fields와 strong ETag를 제공하며 PATCH는 `If-Match` revision CAS, concurrent 200/412, trimmed 1~80 validation을 집행한다.
- mutation 전 in-flight public/admin profile query를 취소하고 성공 시 두 cache를 원자적으로 갱신한다. 412는 draft를 보존한 채 최신 revision refetch 완료까지 저장을 잠근다.

## UI-60 이연 항목

- logo upload는 실제 binary storage, content validation, lifecycle/rollback 계약이 필요해 별도 기능형 follow-up으로 이연한다.
- timezone은 전역 날짜 렌더링·scheduler 적용 계약 없이 저장만 하면 dead setting이므로 제외했다. workspace delete와 team-size/URL은 단일 내부 workspace 제품 범위에 적용하지 않는다.
- D040 Teamspaces는 캡처가 빈 loading state뿐이고, D043 Billing은 SaaS 비적용, D044 Connections는 실제 provider credentials가 없어 추측 UI를 만들지 않았다.

---

# B-033 OneFlow Precision Design System 검증 (2026-07-11)

> 범위: Reverse Spec Pack의 행동·IA·밀도 원칙을 OneFlow 고유 토큰과 component system으로 재해석하고 shell, command palette, display menu/data grid, work-item detail, settings, state surfaces, generated empty-state asset에 통합.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Plan advisory | plan-validator Codex advisory 1 round | **ADVISORY_PASS 0.90** — CRITICAL 0, MAJOR 3, MINOR 2; interactive contract, vertical checkpoints, QA manifest, permission regression을 계획에 반영 |
| Frontend typecheck/lint/build | `make web-build` | **PASS** — 기존 Fast Refresh 경고 3건, 기존 large chunk 경고; generated PNG bundle 450.06KB |
| Frontend pure unit | `make web-unit` | **PASS — 67** |
| Frontend component | `npm run test:component` | **PASS — 8** (2 files; 신규 primitive contract 4건 포함) |
| Focused settings regression | `npx playwright test -g "워크스페이스 일반 설정|settings/admin IA" --workers=1` | **PASS — 2** |
| Frontend full E2E | `make web-e2e` | **PASS — 202, opt-in visual QA 1 skipped** |
| Visual QA manifest | `ONEFLOW_DESIGN_QA=1 npx playwright test -g "OneFlow design system visual QA manifest" --workers=1` | **PASS — 1; screenshots 14** |
| Clean-room | `make cleanroom-check` | **PASS** — manifests, frontend/backend licenses, filename overlap attestation |
| Diff hygiene | `git diff --check` | **PASS** |

## 구현 범위

- `index.css`에 canvas/surface/text/border/accent/semantic/priority tokens, 4/6/8px radii, border-first shadows, 36/44px density, 52px topbar, 240px sidebar, motion, focus, z-index, coarse-pointer, reduced-motion, data-grid contracts를 추가했다.
- Button/Badge/Input/Select/Sheet/Skeleton/Dropdown 호환 API를 유지하며 visual/state contract를 확장했다. IconButton, Avatar/Group, Tooltip, Surface/PageHeader/Toolbar/PropertyRow/InlineAlert, SegmentedControl/Checkbox/Switch/Toggle, DataGridFrame/DataGrid/DensityControl을 추가했다.
- app shell/sidebar/topbar/account surface, command palette combobox/listbox/focus wrap+return, project display menu density, project/all-work semantic grids, full detail/property rail, workspace/project settings, empty/loading/error/read-only/destructive surfaces를 shared tokens에 통합했다.
- generic Popover/Tabs/Kbd/Toast provider 및 HealthChip 공통 추출은 현재 accessible product implementation과 중복되므로 `ONEFLOW_DESIGN_SYSTEM.md`에 명시적 backlog/non-goal로 기록했다. dead control이나 미배선 provider는 추가하지 않았다.

## Generated asset

- built-in image generation으로 reference input 없이 `apps/web/src/assets/generated/oneflow-empty-flow.png`를 생성했다.
- 프로젝트 소비본은 720x540 RGB PNG, SHA-256 `536a557d282c93a933c6f004c92ea9a3cff2194db725b8744d1beedd004abd94`, 440KB다.
- `/work-items` empty/search-zero에 opt-in decorative image로 적용하고 `alt=""`, lazy loading, adjacent semantic copy를 유지했다.
- prompt, provenance, usage, verification, future replacement rule은 `docs/ONEFLOW_GENERATED_ASSETS.md`에 기록했다.

## 시각 QA

Chromium typed mock fixture에서 1440x960과 390x844 viewport를 사용했다. 대상은 projects shell, all-work grid, command palette results, project display menu, work-item full detail, workspace settings, generated empty state다.

스크린샷: `docs/screenshots/design-system/`

- `projects-{desktop,mobile}.png`
- `all-work-{desktop,mobile}.png`
- `command-palette-{desktop,mobile}.png`
- `display-menu-{desktop,mobile}.png`
- `detail-{desktop,mobile}.png`
- `settings-{desktop,mobile}.png`
- `empty-{desktop,mobile}.png`

검사 결과: blank canvas 없음, incoherent overlap 없음, 버튼 label clipping 없음, mobile shell overflow 없음, grid-local horizontal scroll 정상, command palette focus ring/result grouping 정상, generated asset 로딩·비율·가독성 정상. 첫 캡처의 `fullPage` fixed-shell 합성에서 검은 타일 artifact를 발견해 viewport screenshot으로 교체하고 전 캡처를 재생성했다.

## 실패와 재검증

1. visual QA 첫 실행은 lazy image의 `naturalWidth`를 즉시 검사해 실패했다. image load polling으로 수정 후 1/1 PASS했다.
2. full E2E 첫 실행은 Workspace Settings 그룹과 subtitle을 한국어로 정리한 뒤 기존 영문 copy assertion 2건이 실패했다(200 PASS). 새 제품 copy에 맞게 assertion을 갱신하고 focused 2/2 PASS, full 202 PASS로 재검증했다.
3. Sol reviewer는 read-only source inspection을 수행했으나 captured-output budget을 초과해 정식 판정을 반환하지 못했다. 마지막 권고의 segmented radio/palette tabs roving keyboard, combobox-listbox ownership, labeled grid region 접근성을 구현하고 component 8/8, command palette focused 2/2, full E2E 202 PASS로 닫았다.
4. 14장 visual manifest는 접근성 보완 후 첫 재실행에서 기본 30초 전체 테스트 제한을 넘겼다. 해당 opt-in 테스트만 60초로 설정하고 1/1 PASS했다.
5. clean-room과 full E2E를 동시에 돌린 재검증은 reference filename scan의 CPU/IO 경합으로 Initiatives/Releases 두 장기 시나리오가 30초 timeout 됐다(기능 assertion 실패 없음, 나머지 200 PASS). 두 시나리오를 단독 2/2 PASS한 뒤 clean-room과 분리한 `make web-e2e`에서 202 PASS를 최종 확인했다.

## 변경하지 않은 영역

- Backend, database schema, API, permission, environment variable, feature flag 변경 없음.
- 신규 production dependency 없음.
- Plane source/package/asset/class/palette/wording/trade dress 복사 없음.

---

# UI-61 Reference-Composition Global Shell 검증 (2026-07-12)

> 범위: D001과 component pattern의 `topbar + app rail + contextual sidebar + content frame`을 OneFlow의 실제 Projects/Wiki/AI/Settings/search/create 계약에 통합한 clean-room shell surface.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Typecheck | `npm run typecheck` | **PASS** |
| Lint | `npm run lint` | **PASS** — 기존 Fast Refresh 경고 3건만 유지 |
| Production build | `npm run build` | **PASS** — 기존 large chunk 경고만 유지 |
| Pure unit | `npm run test:unit` | **PASS — 67** |
| Component | `npm run test:component` | **PASS — 8** |
| Focused shell/route/authz | `npx playwright test ... --grep "글로벌 레일|모바일 앱 셸|flag OFF|단축키는 편집 필드"` | **PASS** |
| Full frontend E2E | `npm run test:e2e -- --workers=2 --reporter=dot` | **PASS — 204, opt-in visual QA 1 skipped** |
| Clean-room | `make cleanroom-check` | **PASS** |
| Frontend audit | `npm audit --audit-level=high` | **PASS — 0 vulnerabilities** |
| Diff hygiene | `git diff --check` | **PASS** |

## UI 변경

- 44px 전체 폭 topbar 아래에 64px global rail, 248px contextual sidebar, 유동 content frame을 배치했다.
- desktop topbar는 실제 workspace profile, route context, 중앙 search entry, notification/account actions를 유지한다. mobile은 compact topbar와 global/context navigation을 한 drawer에 제공한다.
- 시각 증적은 `docs/screenshots/redevelopment/ui-shell/{desktop-list,mobile-drawer}.png`에 보존한다.

## 기능/API 반영

- Projects는 `/projects`, Wiki는 capability가 켜지고 프로젝트가 있을 때 해당 project documents, AI는 `/my#ai-workspace`, Settings는 admin `/admin` 또는 member `/settings`로 연결된다.
- 새 작업은 선택/첫 프로젝트의 기존 write permission을 통과할 때만 노출되고 실제 `?new=1` composer로 이동한다.
- command palette flag ON은 기존 modal/shortcut을 유지하고, OFF는 dead trigger 대신 실제 `/search` 링크를 제공한다. API, DB, migration, environment variable, dependency 변경은 없다.

## 실패와 재검증

1. 첫 focused E2E에서 project root의 first-project expansion, Settings locator 중복, flag-OFF search absence를 발견해 기존 탐색을 복원하고 기능형 `/search` fallback을 추가했다.
2. 첫 full E2E에서 새 search trigger의 부분 일치 locator와 mobile drawer workspace identity 회귀를 발견해 exact locator와 live workspace profile subtitle로 수정했다.
3. 다음 full E2E에서 flag-OFF palette 계약, hidden local-search focus, user-directory `전체` 부분 일치를 발견해 fallback을 link로 분리하고 local search responsive visibility와 exact locator를 복원했다.
4. 최종 full E2E는 204 PASS, 1 opt-in skip으로 종료했다. 독립 Sol reviewer는 출력 없이 정체되어 종료했고, root diff review에서 단일-workspace topbar의 장식성 chevron을 제거한 뒤 focused route test를 재통과했다.

## 이연 항목

- 없음. 모든 visible control은 기존 실제 route, capability, permission, query state에 연결된다.

---

# UI-62 Central Workspace Home Composition 검증 (2026-07-12)

> 범위: D001의 중앙 정보 흐름을 OneFlow의 실제 workspace 데이터로 재구성한 `/my` home surface.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Typecheck/build | `npm run build` | **PASS** — 기존 large chunk 경고만 유지 |
| Pure unit | `npm run test:unit` | **PASS — 67** |
| Component | `npm run test:component` | **PASS — 8** |
| Focused home/AI | `npx playwright test ... --grep "내 작업 홈이 배정|AI workspace가 켜진" --workers=1` | **PASS — 2** |
| Full frontend E2E | `npm run test:e2e -- --workers=2 --reporter=dot` | **PASS — 204, opt-in visual QA 1 skipped** |
| Diff hygiene | `git diff --check` | **PASS** |

## UI 변경

- 중앙 영역을 AI availability/status band, compact quick links, project shortcuts, dense Recents, personal notes, supporting time/created/inbox/tools 순으로 재배치했다.
- Recents는 기한 임박, 배정 작업, 최근 활동을 같은 scan surface로 묶되 기존 접근성 landmark를 유지한다.
- 1440x960과 390x844 증적은 `docs/screenshots/redevelopment/workspace-home/{desktop,mobile}.png`에 보존한다.

## 기능/API 반영

- 기존 `/me/work`, notifications, projects, personal notes, AI capability, time entries query를 그대로 사용한다.
- 모든 quick link와 project/work/activity item은 기존 실제 route로 이동하며 최근 활동은 owning project의 work-item drawer를 연다.
- API, DB, migration, permission, environment variable, dependency 변경은 없다.

## 이연 항목

- 없음. 새 widget 설정이나 mock quick-link 관리 UI를 만들지 않았으며 visible entry는 모두 실제 기능에 연결된다.

---

# UI-63 Project Directory Composition 검증 (2026-07-12)

> 범위: D002 project discovery를 OneFlow의 실제 project rollup, 생성, 검색, 정렬, 보관, display preference와 통합한 `/projects` surface.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Typecheck/lint/build | `npm run typecheck && npm run lint && npm run build` | **PASS** — 기존 경고만 유지 |
| Pure unit | `npm run test:unit` | **PASS — 67** |
| Component | `npm run test:component` | **PASS — 8** |
| Focused project directory | `npx playwright test ... --grep "프로젝트 목록 정렬|프로젝트 목록 이니셔티브|프로젝트 디렉터리는 모바일|새 프로젝트 폼" --workers=1` | **PASS — 4** |
| Full frontend E2E | `npm run test:e2e -- --workers=2 --reporter=dot` | **PASS — 204, opt-in visual QA 1 skipped** |
| Diff hygiene | `git diff --check` | **PASS** |

## UI 변경

- content header에 project count와 create action을 통합하고 6개 summary card를 compact operational strip으로 바꿨다.
- responsive project card를 기본 layout으로 추가하고 기존 dense list를 실제 layout toggle로 유지한다.
- 카드에는 health, completion, selected rollups, initiatives, dashboard/settings/open actions를 배치했다.
- 1440x960과 390x844 증적은 `docs/screenshots/redevelopment/project-directory-ui/{desktop,mobile}.png`에 보존한다.

## 기능/API 반영

- 기존 project query/create API와 client search, persisted sort/column preferences를 재사용한다.
- card/list layout도 browser preference로 저장하며 archive filter, refresh, initiative highlight, project/dashboard/settings routes를 모두 실제 동작에 연결한다.
- API, DB, migration, permission, environment variable, dependency 변경은 없다.

## 이연 항목

- 없음. cover image나 owner field처럼 OneFlow 계약에 없는 데이터를 추측해 표시하지 않았다.

---

# UI-64 Project Work Items Composition 검증 (2026-07-12)

> 범위: D003 Work items의 중앙 header/view/action 구성을 기존 OneFlow list, query state, saved view, import/export, permissions와 통합한 기능형 surface.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Typecheck/lint/build | `npm run typecheck`, `npm run lint`, `npm run build` | **PASS** — 기존 경고만 유지 |
| Pure unit | `npm run test:unit` | **PASS — 67** |
| Component | `npm run test:component` | **PASS — 8** |
| Focused composition | `npm run test:e2e -- --grep "프로젝트 작업 화면 제어"` | **PASS — 1** |
| Full frontend E2E | `npm run test:e2e` | **202 PASS, opt-in 1 skipped; 기존 3건 병렬 timeout** |
| Failed-test recheck | `npm run test:e2e -- --workers=1 --grep "포트폴리오 리포트가 행|Initiatives 정책은 navigation|Releases 정책은 milestone"` | **PASS — 3** |
| Clean-room | `bash scripts/check_cleanroom.sh` | **PASS** |
| Diff hygiene | `git diff --check` | **PASS** |

## UI 변경

- Work Packages 제목/count와 list/board/backlog/calendar mode navigation, Filter, Display, Analytics, Add action을 하나의 compact control region으로 구성했다.
- search, filters, result count, import/export, saved views는 두 번째 band에서 기존 기능을 보존한다.
- 1440x960과 390x844 증적은 `docs/screenshots/redevelopment/project-work-items-composition-ui/{desktop,mobile}.png`에 보존한다.

## 기능/API 반영

- mode와 analytics는 기존 project routes, Filter는 실제 controls visibility, Display는 URL column/sort state, Add는 write permission과 `?new=1` composer에 연결된다.
- API, DB, migration, permission contract, environment variable, dependency 변경은 없다.

## 이연 항목

- 없음. 새로 노출한 모든 control은 실제 route, query state 또는 권한 기반 mutation entry에 연결된다.

---

# UI-65 Detail Activity Taxonomy 검증 (2026-07-12)

> 범위: D017-D023/RSP-005 activity taxonomy를 drawer/full-page 공통 feed와 기존 activities/comments 계약에 통합.

| 항목 | 명령 | 결과 |
|---|---|---:|
| Typecheck/lint/build | `npm run typecheck`, `npm run lint`, `npm run build` | **PASS** — 기존 경고만 유지 |
| Pure unit / Component | `npm run test:unit`, `npm run test:component` | **PASS — 67 / 8** |
| Focused detail activity | `npm run test:e2e -- --workers=1 --grep "드로어에서 활동 이력을|작업 상세 전체 페이지가|모바일 작업 상세 전체 페이지"` | **PASS — 3** |
| Full frontend E2E | `npm run test:e2e` | **204 PASS, opt-in 1 skipped; 기존 webhook 1건 병렬 failure** |
| Failed-test recheck | `npm run test:e2e -- --workers=1 --grep "webhook 재시도 실패와"` | **PASS — 1** |
| Clean-room / Diff | `bash scripts/check_cleanroom.sh`, `git diff --check` | **PASS** |

## UI 변경

- activity feed에 전체, 활동, 댓글, 업데이트, 전환, 이력 탭과 범위별 empty state를 추가했다.
- drawer와 full-page가 같은 `HistorySection`을 사용하므로 taxonomy와 comment composer 동작이 일치한다.
- 시각 증적은 `docs/screenshots/redevelopment/detail-activity-ui/{desktop,mobile}.png`에 보존한다.

## 기능/API 반영

- Updates는 `action=field_changed`, Transition은 `action=field_changed&field=status`, History는 `action=created`로 기존 서버 필터에 연결된다.
- Comments/All은 기존 thread/reaction/mention/composer 계약을 유지한다. API, DB, migration, permission, env, dependency 변경은 없다.

## 이연 항목

- 없음. RSP-005 taxonomy는 현재 activity action/field 계약 안에서 기능형으로 흡수했다.

---

# UI-66 Detail Properties 검증 (2026-07-12)

- Inline status/priority chips는 drawer/full-page 공통 panel의 실제 select editor를 열고 초점한다.
- Properties heading은 `aria-expanded`를 가진 collapse control이며 panel 폭과 입력 계약을 유지한다.
- Typecheck/lint와 focused drawer/mobile E2E 2건, Chromium desktop/mobile visual QA가 PASS했다.
- 시각 증적: `docs/screenshots/redevelopment/detail-properties-ui/{desktop,mobile}.png`.
- API, DB, migration, permission, environment variable, dependency 변경과 이연 항목은 없다.

---

# UI-67 Work Items State Workflow 검증 (2026-07-12)

- True empty는 writer에게 실제 `?new=1` composer를 여는 `첫 작업 만들기`를 제공한다.
- Filtered empty는 불가능한 create 안내를 제거하고 기존 `현재 보기 초기화` 명령을 사용한다.
- Viewer empty는 생성 CTA 없이 권한에 맞는 안내만 제공한다.
- Focused Playwright 4건이 empty writer/filter/viewer, skeleton, error retry/request-id와 390px overflow를 검증한다.
- Production build, unit 67, component 8, full frontend E2E 206 PASS와 opt-in visual QA 1 skip, clean-room gate가 통과했다.
- 시각 증적은 `docs/screenshots/redevelopment/states-mobile/{empty-list,list-skeleton,error-list}.png`에 보존한다.
- API, DB, migration, permission contract, environment variable, dependency 변경과 이연 항목은 없다.

---

# UI-68 Wiki Central Composition 검증 (2026-07-12)

- Global Wiki rail이 활성일 때 context sidebar는 Projects/새 작업 대신 공유·비공개·보관됨 bucket과 프로젝트 Wiki 공간을 제공한다.
- 중앙 surface는 compact Wiki header, lifecycle tabs, always-visible search/count, permission-gated create, tree/summary/empty states를 공유한다.
- Focused Playwright 3건이 Wiki shell route, document open, private create/archive/restore를 검증했다.
- Production build, unit 67, component 8, clean-room이 통과했다. Full E2E는 206 PASS와 opt-in 1 skip 후 제거한 `Content surface` 문구를 기대한 1건을 Wiki heading 계약으로 갱신해 단독 재검증 PASS했다.
- Chromium 1440x960과 390x844 증적은 `docs/screenshots/redevelopment/wiki-central-composition-ui/{desktop,mobile}.png`에 보존한다.
- API, DB, migration, permission contract, environment variable, dependency 변경과 이연 항목은 없다.

---

# UI-69 AI Central Composition 검증 (2026-07-12)

- Global AI rail은 first-class `/ai` route와 AI 전용 context navigation을 열며 Projects/새 작업 control을 노출하지 않는다.
- 중앙 surface는 실제 `/api/v1/capabilities`와 `/api/v1/me/work`를 결합하고 후보를 기존 work-item detail의 AI summary mutation으로 연결한다.
- disabled/error/empty/admin/non-admin 상태는 기존 권한과 capability 계약을 따르며 mock/dead control은 없다.
- Production build, unit 67, component 8, focused E2E 3, full E2E 208 PASS와 opt-in visual QA 1 skip이 통과했다. lint는 기존 Fast Refresh 경고 3건만 유지한다.
- Chromium 1440x960 및 390x844 증적은 `docs/screenshots/redevelopment/ai-central-composition-ui/{desktop,mobile}.png`에 보존한다.
- API, DB, migration, permission contract, environment variable, dependency 변경과 이연 항목은 없다.

---

# UI-70 Settings Central Composition 검증 (2026-07-12)

- Global Settings rail은 `/settings`와 `/admin/*`에서 Projects/새 작업 대신 personal/workspace/features/developer context navigation을 제공한다.
- 관리자에게만 workspace 설정 links를 노출하고 기존 `WorkspaceSettingsShell`의 fail-closed gate는 유지한다. 중앙의 중복 navigation만 제거해 실제 설정 form을 주 surface로 만든다.
- 기존 personal settings, workspace profile CAS, Wiki/AI/Initiatives/Releases/Customers policy, Webhooks, Worklogs route/API는 변경하지 않았다.
- Production build, unit 67, component 8, focused E2E 5가 통과했다. Full E2E는 205 PASS와 opt-in 1 skip 후 기존 병렬 timing 2건 및 Settings 문맥 assertion 2건을 1 worker로 재검증해 4 PASS했다.
- Chromium 1440x960 및 390x844 증적은 `docs/screenshots/redevelopment/settings-central-composition-ui/{desktop,mobile}.png`에 보존한다.
- API, DB, migration, permission contract, environment variable, dependency 변경과 이연 항목은 없다.

---

# UI-71 Shell Route State 검증 (2026-07-12)

- Wiki, AI, Settings가 아닌 `/my`, `/work-items`, `/inbox`, project routes는 Projects global rail을 active app context로 표시한다.
- Wiki/AI/Settings active 우선순위와 실제 route href는 변경하지 않았다.
- Production build와 focused Playwright shell E2E 5건이 통과했다.
- API, DB, migration, permission contract, environment variable, dependency 변경과 이연 항목은 없다.

---

# UI-72 Workspace Home Widgets 검증 (2026-07-12)

- `/my` header의 `위젯 관리` menu는 AI workspace, 빠른 이동, 프로젝트 바로가기, 최근 항목, 개인 메모의 실제 기존 section을 즉시 표시하거나 숨긴다.
- 선택은 `oneflow.workspace-home.widgets.v1` browser preference로 저장되며 reload 후 유지되고 `모든 위젯 복원`으로 기본 전체 표시를 복구한다. 손상되거나 사용할 수 없는 storage는 기본값으로 안전하게 복구한다.
- Production build, lint, unit 67, component 8, focused E2E 2, full E2E 211 PASS와 opt-in visual QA 1 skip이 통과했다.
- Chromium desktop/mobile 증적은 `docs/screenshots/redevelopment/workspace-home-widgets-ui/{desktop,mobile}.png`에 보존한다.
- API, DB, migration, permission contract, environment variable, dependency 변경과 이연 항목은 없다.

---

# UI-73 Projects Sidebar Hierarchy 검증 (2026-07-12)

- Projects context navigation을 개인 primary, workspace, 기능형 `더 보기`, project-scoped navigation 순으로 재구성했다.
- `더 보기`는 native disclosure로 동작하고 direct child route에서는 자동으로 열리며, Customers/Initiatives는 기존 capability에 따라 노출된다.
- 프로젝트 하위 navigation은 실제 project route에서만 펼쳐지고 New Work는 기존 membership write 권한을 유지한다.
- Focused Playwright 8건이 desktop/mobile hierarchy, settings 이동, report, drafts, worklogs, initiatives 정책 회귀를 검증했다. Production build, lint, full frontend E2E 212 PASS와 opt-in visual QA 1 skip, clean-room과 diff gate도 통과했다.
- 시각 증적은 `docs/screenshots/redevelopment/projects-sidebar-hierarchy-ui/{desktop,mobile}.png`에 보존한다.
- API, DB, migration, permission contract, environment variable, dependency 변경과 이연 항목은 없다.

---

# UI-74 Topbar Context Navigation 검증 (2026-07-12)

- Topbar title은 `/my` overview와 assigned/created/subscribed/activity query, workspace route, project route를 구분한다.
- Workspace/project scope와 route group breadcrumb는 canonical route를 가진 실제 links이며 현재 page title은 `aria-current=page`로 표시한다.
- Production build, lint, `CI=true` focused Playwright와 full frontend E2E 213 PASS 및 opt-in visual QA 1 skip이 통과했다.
- Chromium 1440x960 및 390x844 증적은 `docs/screenshots/redevelopment/topbar-context-ui/{desktop,mobile}.png`에 보존한다.
- API, DB, migration, permission contract, environment variable, dependency 변경과 이연 항목은 없다.

---

# UI-75 Global App Contexts + Wiki Home 검증 (2026-07-12)

- Wiki global rail은 capability loading/error/OFF와 접근 프로젝트 0건에도 항상 `/wiki` first-class app entry로 유지된다.
- Projects/Wiki/AI/Settings를 선택하면 각각 `Projects 컨텍스트 내비게이션`, `Wiki 컨텍스트 내비게이션`, `AI 컨텍스트 내비게이션`, `설정 컨텍스트 내비게이션`으로 교체된다.
- `/wiki`는 기존 Wiki capability gate 안에서 신규 `GET /api/v1/documents?bucket=` workspace 조회를 사용해 membership/private visibility를 SQL에서 집행하고 shared/private/archived 범위, 검색, 프로젝트 필터, 문서/project-space links를 제공한다.
- Focused API lifecycle 7과 full API 637, disabled/no-request, zero-project, aggregate search/filter, invalid bucket, desktop/mobile context switching focused Playwright 7건, production build, API lint, OpenAPI drift, clean-room이 통과했다. 최종 full frontend E2E는 216 PASS와 opt-in visual QA 1 skip으로 통과했다.
- 시각 증적은 `docs/screenshots/redevelopment/global-app-contexts-ui/`에 보존한다.
- API는 membership-filtered workspace document list GET 1개를 추가했다. DB, migration, permission model, environment variable, dependency 변경과 이연 항목은 없다.

---

# UI-76 Sidebar Personalization 검증 (2026-07-12)

- Desktop context sidebar는 global app rail을 남긴 채 접고 펼칠 수 있으며 topbar workspace 영역과 main 시작점이 같은 persisted collapse 상태를 따른다.
- Projects context의 개인·워크스페이스·더 보기 항목은 접근 가능한 modal Customize navigation에서 표시 여부와 그룹 내 순서를 변경하고 기본값으로 복원할 수 있다.
- `oneflow.sidebar.preferences.v1` browser preference는 reload와 cross-tab에서 collapse/visibility/order/reset을 동기화하고 손상·누락·사용 불가 storage를 기본값으로 복구한다. 모바일 drawer는 desktop collapse와 무관하게 전체 navigation과 동일한 customization을 제공한다.
- Dialog 초기 포커스, Tab/Shift+Tab 순환, Escape 종료와 trigger 포커스 복원, desktop/mobile viewport 경계를 Playwright로 검증했다. 독립 reviewer의 focus lifecycle과 persistence coverage 지적을 수정한 뒤 closure `APPROVED`를 받았다.
- Production build, typecheck, lint와 focused personalization E2E 2건이 통과했다. Full E2E 첫 worker-4 run은 215 PASS·1 skip과 기존 장기 시나리오 3건의 환경 timeout, worker-2 run은 215 PASS·1 skip과 skeleton 캡처 race/장기 policy 2건을 확인했다. Skeleton hold를 2초로 고정하고 Wiki/Initiatives policy timeout을 60초로 조정한 후 affected 3건은 3 PASS로 재검증했다.
- 시각 증적은 `docs/screenshots/redevelopment/sidebar-personalization-ui/`에 보존한다.
- API, DB, migration, permission contract, environment variable, dependency 변경과 이연 항목은 없다.

---

# UI-77 Floating Shell Frame + Quick Tools 검증 (2026-07-12)

- Topbar와 global rail은 같은 outer chrome surface를 사용하고, desktop context pane/main은 좌우 8px radius와 우측·하단 8px 여백을 공유하는 floating work frame을 구성한다. Sidebar collapse 시 main이 좌측 border/radius를 이어받으며 mobile은 full-bleed를 유지한다.
- 우측 하단 Quick Dock은 collapsed icon에서 세로 toolbar로 확장되고 실제 Inbox, AI workspace, Personal Notes, permission-aware New Work route만 제공한다. New Work는 기존 `useCanWrite`의 member/owner·archive fail-closed 계약을 재사용하며 viewer에게 노출되지 않는다.
- Dock은 Escape 종료와 trigger focus 복원, reduced-motion, desktop/mobile viewport boundary를 제공한다. main 끝의 dynamic safe area는 expanded dock 높이 이상을 확보해 마지막 콘텐츠를 스크롤해 dock 위로 올릴 수 있다.
- 모바일 sidebar를 열 때 dock은 먼저 닫혀 modal 뒤 focus 이동을 막는다. Navigation Customize가 drawer 안에서 열리면 첫 Escape는 nested dialog와 trigger focus만 복구하고, 두 번째 Escape가 drawer를 닫는다.
- Production typecheck/lint와 focused shell regression 9, 최종 frame/dock/mobile-modal closure 3이 통과했다. 독립 reviewer가 발견한 mobile Escape/focus, collapsed frame boundary, dock safe inset을 모두 수정했으며 마지막 reviewer 도구 예산 종료 시에도 focused 3 PASS와 PR 진행 가능 상태를 확인했다.
- PR #244 첫 frontend CI는 collapsed dock이 Modules 모바일 행 액션과 겹쳐 click을 가로채는 회귀를 정확히 검출했다. main interactive element의 사각형을 관찰해 같은 우측 축에서 가장 가까운 빈 슬롯으로 dock을 올리는 collision avoidance를 추가하고, frame/dock/Modules focused 3 PASS와 명시적 비겹침 assertion으로 재검증했다.
- 시각 증적은 `docs/screenshots/redevelopment/floating-shell-tools-ui/`에 보존한다.
- API, DB, migration, permission contract, environment variable, dependency 변경과 이연 항목은 없다.

---

# UI-78 Quick Notes Dock + Sticky Notes 검증 (2026-07-12)

- 우측 하단 Quick Dock의 개인 메모 도구는 접힘, compact 편집, expanded 편집, 전체 메모 modal을 오가며 동일한 개인 메모 CRUD API를 사용한다. 검색, 즉시 빈 메모 생성, 제목·본문 inline 저장, Markdown 굵게·기울임·체크리스트 삽입, 색상, 고정, 순서, 삭제가 실제 요청에 연결된다.
- API와 migration `0078_personal_note_sticky_surface`는 빈 제목과 color를 지원하고 사용자별 완전한 빈 메모를 하나만 허용한다. 생성·수정은 기존 사용자 advisory lock과 `expected_version` 충돌 계약을 유지하며 DB partial unique index가 최종 무결성을 보장한다.
- 활성 검색에 기존 빈 메모가 숨은 경우 검색을 해제해 해당 카드를 복원하고 제목에 포커스한다. mutation 중 모든 카드 변경 control을 잠그며 E2E mock도 운영 API와 같이 stale `expected_version`을 409로 거절한다.
- API focused 6와 full API 637, migration base downgrade/head upgrade, OpenAPI generation/drift, web unit 67, typecheck, lint, production build, clean-room, UI-78 focused E2E가 통과했다. Full frontend E2E는 217 PASS·1 skip 후 기존 보고/Worklogs 병렬 진입 timeout 3건을 단독 재실행해 3 PASS했다.
- Chromium desktop/mobile 증적은 `docs/screenshots/redevelopment/quick-notes-dock-ui/`와 `docs/screenshots/redevelopment/personal-notes-ui/`에 보존한다.
- 환경변수와 dependency 변경은 없다. DB migration 적용이 필요하며 기능·API 이연 항목은 없다.

---

# UI-79 Frame Context Header + Workspace Popover 검증 (2026-07-12)

- 글로벌 topbar는 contextual sidebar의 접힘 상태와 무관하게 OneFlow 로고·workspace 이름·chevron을 유지하고 검색·알림·계정 surface와 같은 outer chrome을 구성한다.
- route scope/parent/current title은 중앙 floating frame 내부의 44px `FrameContextBar`로 이동했다. Desktop contextual sidebar가 접히면 expand control은 global rail이 아니라 frame 좌측 44px 전용 슬롯에 표시되고, 펼친 상태의 collapse control은 sidebar header에 유지된다.
- workspace popover는 실제 `/admin/general` 또는 `/settings`, 관리자 전용 `/admin/users`, `POST /api/v1/auth/logout`에 연결된다. 관리자/일반 멤버 권한별 action, 초기 포커스, Tab 순환, Escape/outside 종료, trigger 포커스 복원을 제공하며 우측 account menu와 하나의 open state를 공유한다.
- main frame은 context bar를 고정하고 명시적 scroll region만 스크롤한다. Quick Dock collision observer도 해당 region의 scroll을 관찰하며 하단 action과의 비겹침을 E2E로 검증했다.
- Production build, typecheck, lint, unit 67, clean-room, focused shell/menu/collision E2E 11건과 최종 full frontend E2E 224 PASS·opt-in visual QA 1 skip이 통과했다. lint는 기존 Fast Refresh 경고 3건만 유지한다.
- Chromium 증적은 `docs/screenshots/redevelopment/shell-header-workspace-switcher-ui/`의 desktop, desktop-collapsed, desktop-popover, mobile 이미지에 보존한다.
- API, DB, migration, environment variable, dependency 변경은 없다. OneFlow는 현재 단일 workspace이며 create-workspace와 workspace invitation lifecycle API가 없어 해당 control은 dead UI로 만들지 않고 후속 제품 범위로 이연한다.

---

# UI-101 Topbar Functional Help 검증 (2026-07-14)

- Global Topbar에 Help 아이콘과 anchored menu를 추가하고, Wiki capability가 켜진 경우 `/wiki`, 항상 사용 가능한 `/status`, 현재 활성 단축키를 보여주는 modal에 연결했다. 지원되지 않는 외부 support/sales/forum/changelog/version control은 만들지 않았다.
- Help menu는 workspace/account와 하나의 open state를 공유한다. Pointer/keyboard 진입, Escape/outside 종료, trigger focus 복원, modal focus trap, overlay registry, mobile collision과 reduced-motion을 검증했다.
- Command palette flag OFF에서는 `Meta/Ctrl+K`와 `/`를 표시하지 않고, ON에서는 두 단축키를 표시한다. Help menu/modal이 열린 동안 global shortcut은 command palette를 중첩해 열지 않는다.
- 검증: typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk 경고), unit 87, component 8, focused E2E 2, full E2E 256 PASS + opt-in visual QA 1 skip, clean-room frontend 161/backend 44, npm audit high 0 vulnerabilities, diff check PASS.
- Chromium 증적은 `docs/screenshots/redevelopment/topbar-help-ui/{desktop-menu,mobile-menu}.png`에 보존한다.
- API, DB, migration, permission contract, environment variable, settings UI, dependency 변경과 이연 항목은 없다.

---

# UI-102 Quick Dock Height-fold 보정 검증 (2026-07-14)

- 기존 five-track clip/crossfade 구성을 실제 높이, action group, persistent trigger rotation의 three-track WAAPI로 단순화했다. 세 track은 opening/closing별 하나의 `Animation.startTime`을 공유하며 declarative CSS는 첫 frame에서 paused 상태로 유지된다.
- Opening phase 첫 렌더에서 X 한 개가 표시되고 48px collapsed pill이 측정된 action stack 높이까지 위로 펼쳐진다. Closing phase 첫 렌더에서는 note 한 개가 표시되고 같은 trigger가 역회전하는 동안 실제 pill 높이가 48px로 접힌다. `column-reverse`와 shrink 방지로 trigger DOM, 크기, 하단 중심은 1px 이내에서 유지된다.
- Current-frame reverse, duplicate input, Escape, focus handoff, collision avoidance, central-frame scroll geometry, runtime reduced-motion settlement와 Personal Notes CRUD 계약은 유지한다.
- 검증: typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk 경고), unit 87, component 8, focused E2E 2 및 병렬 repeat 6, full E2E 257 PASS + opt-in visual QA 1 skip, clean-room frontend 161/backend 44, npm audit high 0, diff check PASS. PR #278 CI run `29292331964`과 main integration run `29292668210`의 backend/frontend/cleanroom/security-audit 4잡이 모두 PASS했고 squash merge `823d36a`로 반영됐다.
- 초기 구현에서 actual-height flex shrink가 trigger 중심을 32px 이동시키는 실패를 focused E2E가 검출했다. Bottom-first fixed-size flex ordering으로 수정한 뒤 동일 geometry/phase test가 PASS했다.
- 독립 reviewer는 opening 중 비동기 메모 도착으로 action 수가 바뀌면 height 종점이 낡을 수 있음을 지적했다. 현재 computed frame을 스냅샷으로 잡고 원래 deadline까지 남은 시간 동안 height/actions/rotation 세 track을 새 공통 epoch로 재시작하도록 수정했으며, 2→3 action retarget의 연속 높이·최종 측정 높이·1ms 이하 start-time skew를 E2E로 고정했다.
- Chromium early-frame 증적은 `docs/screenshots/redevelopment/quick-dock-height-fold-ui/{early-opening,early-closing}.png`에 보존한다.
- API, DB, migration, permission contract, environment variable, settings UI, dependency 변경과 이연 항목은 없다.

---

# UI-103 Functional Get Started 검증 (2026-07-14)

- Global Topbar에 compact `시작하기` route entry를 추가하고 `/get-started`에 현재 워크스페이스의 실제 프로젝트, 전체 작업, 관리자용 활성 사용자 데이터를 이용한 체크리스트를 제공한다. 완료 여부는 브라우저 임시 상태로 바뀌지 않으며 query 오류는 미완료가 아닌 재시도 가능한 오류로 표시된다.
- 프로젝트 없음은 `/projects?new=1`의 기존 생성 form, 쓰기 가능한 프로젝트의 작업 없음은 해당 project composer, 완료된 프로젝트·작업은 Overview와 All work items, 관리자 팀 항목은 `/admin/users`로 이동한다. 일반 멤버는 admin users query와 팀 항목을 모두 건너뛴다.
- 프로젝트 생성 deep link는 취소 시 `new` query를 replace로 제거한다. Desktop/mobile에서 active topbar state, progressbar, 권한별 2/3항목, 마지막 action의 Quick Dock 비가림과 가로 overflow 없음을 확인했다.
- 독립 reviewer가 전체 사용자 수를 쓰면 비활성 계정이 팀 완료로 계산되는 문제를 발견했다. 활성 사용자 2명 이상으로 기준을 수정하고 비활성 계정 회귀 테스트를 추가해 focused E2E 4건을 PASS했다.
- 전체 E2E 첫 실행은 신규 3건 포함 258 PASS 중 기존 Quick Dock 수동 timeline 2건이 병렬 CPU stall로 1초 phase를 놓쳤다. 해당 test-only 구간을 10초 manual timeline과 명시적 `finish()`로 고정하고 production 기본 300ms assertion은 유지했으며 repeat 6과 재실행 full E2E 260 PASS + opt-in visual QA 1 skip을 확인했다. 활성 사용자 보정과 회귀 테스트 추가 후 focused 4, typecheck/lint/build 및 최종 full E2E 261 PASS + opt-in visual QA 1 skip을 다시 확인했다.
- Production build PASS(기존 chunk 경고), unit 87, component 8, clean-room frontend 161/backend 44, npm audit high 0, diff check PASS. Chromium 증적은 `docs/screenshots/redevelopment/get-started-ui/{desktop-complete,mobile-complete}.png`에 보존한다.
- 기존 API만 재사용했고 API, DB, migration, permission contract, environment variable, settings UI, dependency 변경과 이연 항목은 없다. PR/CI 결과는 게이트 후 이어서 기록한다.

---

# UI-104 Workspace Analytics 검증 (2026-07-14)

- Workspace Views toolbar의 실제 `분석` 명령은 dialog가 열릴 때만 현재 Basic/PQL query와 같은 권한·scope·검색·상태·우선순위 조건으로 집계를 요청한다. 상태, 우선순위, 프로젝트 상위 10개와 초과 요약, 일정 분포를 compact한 정보 구조로 제공한다.
- 신규 `GET /api/v1/search/work-packages/analytics`는 기존 workspace search의 membership/current-member, watcher, archive, PQL 검증·정렬·LIMIT 계약을 재사용한다. 정해진 bucket을 0건까지 안정적으로 반환하고 프로젝트 overflow를 숨기지 않는다.
- Dialog는 loading, error/retry, true empty, populated, mobile viewport, Escape/outside, trigger focus restore와 reduced-motion 상태를 제공하며 mock/dead control은 없다.
- 검증: API focused 25 및 full 675 PASS(기존 Alembic 경고 1건), API Ruff/format PASS, OpenAPI drift PASS, typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk 경고), unit 87, component 8, full E2E 263 PASS + opt-in visual QA 1 skip 후 최종 경계 보정 focused E2E 2 PASS, clean-room frontend 161/backend 44, npm audit 0 vulnerabilities, pip-audit 0 vulnerabilities, diff check PASS.
- 독립 reviewer는 권한 집계와 bounded response를 확인하고, 캐시가 남은 재조회 실패에서 이전 차트가 오류와 함께 보일 수 있는 상태 및 0건 막대의 최소 폭을 지적했다. Analytics를 열 때 최신 조회하도록 하고 오류 시 stale data를 숨기며 0건을 0px로 수정한 뒤 집중 E2E로 고정했다. reduced-motion도 overlay animation과 chart transition 제거를 직접 검증한다.
- Chromium 증적은 `docs/screenshots/redevelopment/workspace-analytics-ui/{desktop-basic,mobile-empty}.png`에 보존한다.
- DB, migration, permission model, environment variable, settings UI, dependency 변경과 이연 항목은 없다. API 추가와 generated shared type 갱신이 필요 범위에 포함된다.

---

# UI-105 Functional Login Experience 검증 (2026-07-14)

- `/login`을 original paper-cut journey artwork가 있는 desktop two-column brand/auth composition과 880px 이하의 focused single-column mobile composition으로 재구성했다. 배경 자산은 built-in image generation으로 새로 만들고 1.9MB PNG를 356KB JPEG로 최적화했으며, 시안의 asset/logo/CSS/DOM은 사용하지 않았다.
- 실제 서버 계약만 노출한다. Dev mode는 active directory user의 passwordless email 세션 생성과 identity-bound React Query cache clear를 유지하고, OIDC mode는 backend 501 경계에 맞춰 공급자 연결 준비 상태만 안내한다. Password, Google/Microsoft, reset, account creation control은 dead UI로 만들지 않았다.
- Auth config loading, fetch error/manual retry, generic 401/no-account-enumeration message, submit pending, OIDC unavailable, unknown auth mode fail-closed, desktop/mobile, keyboard/autofill, focus, reduced-motion과 horizontal overflow를 검증했다. Login error는 `aria-describedby`로 email input과 연결한다.
- `next`는 같은 origin의 `/` 경로만 허용한다. Absolute URL, protocol-relative URL, backslash-host 변형은 모두 `/projects`로 귀결하며 E2E에서 navigation origin 불변을 확인했다. 로그인 성공 시 기존 `queryClient.clear()` identity cache purge를 유지한다.
- 검증: typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk 경고), unit 87, component 8, focused auth E2E 3, full E2E 265 PASS + opt-in visual QA 1 skip, clean-room frontend 161/backend 44, npm audit high 0, diff check PASS. 독립 deep-review 4건 수정 후 closure reviewer `NO FINDINGS`.
- Chromium 증적은 `docs/screenshots/redevelopment/login-ui/{desktop,mobile}.png`에 보존한다.
- API, DB, migration, permission contract, environment variable, settings UI, dependency 변경은 없다. 실제 OIDC code flow, password/social login, password reset과 account creation은 보안 계약·IdP 인프라가 필요한 별도 기능 PR로 명시 이연한다.

---

# UI-106 Workspace Column Ordering 검증 (2026-07-14)

- Workspace Views의 Display 메뉴에서 현재 표시 중인 열의 순서를 별도 dialog로 조정할 수 있다. 선택 열만 노출하며 첫 행의 위 이동과 마지막 행의 아래 이동은 비활성화되고, 경계로 이동한 뒤에도 다음 유효 명령으로 focus가 이어진다.
- 변경된 순서는 기존 `columns` URL 배열에 그대로 반영된다. 중복·알 수 없는 값은 제거하되 첫 유효 등장 순서를 보존하고, 현재 page와 Basic/PQL query, sort, layout 등 다른 presentation state는 유지한다.
- Table header와 각 data row는 같은 ordered column 배열을 사용한다. 기존 상태·우선순위 sort menu와 inline editor도 순서 변경 뒤 그대로 작동한다.
- private saved view의 create, PATCH, 재적용 계약이 열 배열 순서를 보존한다. 저장 전 변경 상태와 되돌리기, 다음 Add view 동작까지 검증해 menu/dialog overlay가 body pointer lock을 남기지 않도록 고정했다.
- Dialog는 명시적 닫기, Escape, outside dismiss, trigger focus restore, desktop/mobile responsive 상태를 제공한다. 모바일에서도 수평 overflow 없이 열 이동 control을 사용할 수 있다.
- 검증: typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk 경고), unit 87, component 8, focused UI-106 E2E 1 PASS, full E2E 264 PASS + opt-in visual QA 1 skip. full E2E의 unrelated parallel timing 실패 2건은 즉시 격리 재실행해 2 PASS를 확인했다. OpenAPI drift PASS, clean-room frontend 161/backend 44, npm audit 0 vulnerabilities, diff check PASS.
- Chromium 증적은 `docs/screenshots/redevelopment/workspace-column-order-ui/{desktop,mobile}.png`에 보존한다.
- 독립 reviewer는 실행 예산 종료 전 unit/TypeScript/diff check를 확인하고 boundary disabled, 실제 row cell order, page 보존 assertion 보강을 요청했다. root가 세 범주를 E2E에 추가한 뒤 focused E2E와 전체 회귀를 다시 통과시켰다.
- API, DB, migration, permission contract, environment variable, settings UI, dependency 변경과 이연 항목은 없다.

---

# UI-107 Project Directory User Preferences 검증 (2026-07-14)

- Project Directory의 표시 열, 정렬 기준·방향, 카드/목록 레이아웃을 인증 사용자별 `GET/PUT /api/v1/me/project-directory-preferences`에 저장한다. 서버 row가 없으면 built-in default와 `is_default=true`를 반환하고, 저장 row는 사용자 삭제 시 cascade된다.
- 열·정렬·방향·레이아웃은 API와 DB CHECK 모두 닫힌 어휘로 제한한다. 열 중복은 첫 등장 순서로 제거하며 빈 열 배열도 사용자의 의도적인 최소 표시로 보존한다. 마지막 저장 요청이 승리하고 다른 사용자의 설정은 조회·변경할 수 없다.
- 기존 `oneflow.projects.*.v1` localStorage는 즉시 UI와 네트워크 실패 fallback으로 유지한다. 서버가 아직 default일 때만 유효한 로컬 설정을 한 번 승격하고, 기존 서버 row는 덮어쓰지 않는다. 서버 응답 전 사용자 조작은 늦은 hydration이 덮어쓰지 않는다.
- 변경은 화면과 로컬 fallback에 즉시 반영되고 서버 쓰기는 직렬화된다. 조회 실패와 저장 실패는 서로 구분된 compact 상태와 실제 재시도 명령을 제공하며, 재시도는 가장 최근 화면값을 보낸다. React Strict Mode의 mount cleanup에서도 writer를 재활성화해 저장이 누락되지 않도록 E2E로 고정했다.
- 검증: API focused 4 및 full 679 PASS(기존 Alembic 경고 1건), Ruff/format PASS, migration `0081 -> 0080 -> 0081` PASS, OpenAPI generation/drift PASS, typecheck/lint/build PASS(기존 Fast Refresh 4·chunk 경고), unit 91, component 8, full E2E 268 PASS + opt-in visual QA 1 skip 후 lifecycle 보정 focused Project Directory 3·인증 3 PASS, clean-room frontend 161/backend 44, web npm audit 0 vulnerabilities, diff check PASS.
- Chromium 증적은 `docs/screenshots/redevelopment/project-directory-preferences-ui/{desktop,mobile}.png`에 보존한다.
- Migration `0081` 적용이 필요하다. 환경변수, 설정 UI, dependency 변경과 기능 이연 항목은 없다.

---

# UI-108 Project Health History 검증 (2026-07-14)

- 기존 owner-only 프로젝트 상태 PATCH와 archive write guard를 유지하면서, 실제 report가 바뀐 경우에만 이전/현재 health+note, 작성자, 시각을 같은 transaction의 append-only `project_health_history`에 기록한다. 동일한 정규화 report는 최신 stamp와 이력 모두 움직이지 않는 true no-op이다.
- 신규 member-only `GET /api/v1/projects/{project_id}/health-history`는 limit 1–100과 offset을 적용하고 최신순으로 반환한다. 비멤버는 404, 작성자 삭제는 FK `SET NULL`과 UI의 `이전 구성원` fallback으로 처리하며, 프로젝트 삭제는 history를 cascade한다.
- Project Overview에는 별도 카드 중첩 없이 최신순 전환 타임라인을 추가했다. loading skeleton, fetch error/retry, true empty, bounded-count 안내, current-note fallback과 mobile-safe 줄바꿈을 제공하고, 상태 저장 mutation은 current project와 history cache를 함께 무효화한다.
- 검증: API focused 4 및 full 681 PASS(기존 Alembic 경고 1건), Ruff/format PASS, migration 0082 full upgrade→base downgrade→head upgrade PASS, OpenAPI generation/drift PASS, unit 91, component 8, typecheck/lint/build PASS(기존 Fast Refresh 4·chunk 경고), focused E2E 2 PASS. Full E2E는 268 PASS+visual QA 1 skip이며 병렬 API 부하에서 timeout 난 unrelated 3건을 격리 재실행해 3 PASS를 확인했다.
- Clean-room frontend 161/backend 44, npm/pip audit 0 vulnerabilities, diff check와 desktop/mobile visual QA가 통과했다. 증적은 `docs/screenshots/redevelopment/project-health-history-ui/{desktop,mobile}.png`에 보존한다.
- Migration `0082` 적용이 필요하다. 환경변수, 설정 UI, dependency 변경은 없다. Project Phases는 다음 독립 lifecycle surface로 이연한다.

---

# UI-112 Project Phase Gates 검증 (2026-07-15)

- 기존 fixed project phase에 선택형 시작·종료 gate를 추가했다. Gate 활성화는 phase row에 영속화하고, 표시 날짜는 활성 phase의 start/end boundary에서만 파생한다. Gate 날짜를 독립 입력하는 API나 UI는 만들지 않았다.
- 프로젝트 owner만 기존 optimistic `version` PATCH로 gate를 변경할 수 있다. Member는 Settings와 Overview에서 읽을 수 있으며, archive row lock 재확인, null boolean 거부, true no-op, version conflict, inactive phase의 gate 설정 보존과 파생 날짜 숨김을 유지한다.
- Settings는 단계별 두 gate의 실제 switch와 파생 날짜 상태를 제공하고, 미저장 날짜가 있으면 같은 phase의 즉시 mutation을 잠가 stale version 경쟁을 막는다. Overview는 활성 gate만 phase 아래에 표시하며 desktop/mobile 정보 흐름과 오류·빈 상태를 유지한다.
- 검증: API focused 5 및 full 730 PASS(기존 Alembic 경고 1건), Ruff/format PASS, 전용 DB에서 full upgrade와 `0087 -> 0086 -> 0087` PASS, OpenAPI generation/drift PASS, typecheck/lint/build PASS(기존 Fast Refresh 4·chunk 경고), unit 93, component 8, focused phase E2E 3 PASS. Full E2E는 279 PASS + visual QA 1 skip이며 unrelated 병렬 timeout 2건을 단일 worker로 각 3회 재실행해 6 PASS를 확인했다.
- Clean-room frontend 161/backend 45, npm/pip audit 0 vulnerabilities, diff check와 desktop/mobile visual QA가 통과했다. 제한 독립 reviewer와 root 전체 diff review에서 P0-P2 결함은 발견되지 않았다. 증적은 `docs/screenshots/redevelopment/project-phase-gates-ui/`에 보존한다.
- Migration `0087` 적용이 필요하다. 환경변수, dependency 변경은 없다. Working-day 기반 자동 재스케줄과 workspace-wide custom phase definition 관리는 후속 lifecycle surface로 명시 이연한다.

---

# UI-113 Project Phase Working-day Scheduling 검증 (2026-07-15)

- 활성 단계의 비어 있지 않은 종료일이 실제로 바뀌면 뒤의 활성 단계를 고정 순서로 순회한다. 완전한 일정은 다음 월-금 근무일에 시작하고 기존 inclusive 근무일 기간을 보존해 연쇄 이동하며, 비활성 단계는 건너뛴다. 시작일만 있는 부분 일정은 다음 근무일로 한 번 이동한 뒤 연쇄를 멈추고, 종료일만 있거나 일정이 없는 단계는 보존하고 멈춘다.
- 종료일 삭제·시작일 단독 변경·비활성 원본 단계는 후속 일정을 바꾸지 않는다. owner-only write, member read, archived project lock, optimistic version, true no-op, gate boundary 파생과 단일 transaction 계약을 유지한다. 날짜 상한을 넘는 계산은 422로 전체 쓰기를 거부한다.
- Settings는 월-금 자동 일정 범위를 설명하고 실제 종료일 변경 저장에만 적용 완료 상태를 표시한다. mutation은 후속 단계 cache refetch까지 pending을 유지해 새 start/end와 Overview gate 날짜를 즉시 같은 사실로 보여준다. 시작일 단독 저장에는 적용 문구가 나타나지 않는다.
- 검증: API focused 8 및 full 733 PASS(기존 Alembic 경고 1건), Ruff/format PASS, typecheck/lint/build PASS(기존 Fast Refresh 4·chunk 경고), unit 93, component 8, focused lifecycle E2E PASS, full E2E 281 PASS + opt-in visual QA 1 skip, clean-room frontend 161/backend 45, npm/pip audit 0 vulnerabilities, diff check PASS.
- Chromium 증적은 `docs/screenshots/redevelopment/project-phase-working-days-ui/{settings-desktop,overview-desktop,overview-mobile}.png`에 보존한다. 신규 API route, DB schema/migration, environment variable, dependency 변경은 없다. 공휴일·사용자 정의 근무일, 활성화 전환 재배치와 workspace custom phase definition 관리는 후속 PR로 이연한다.

---

# UI-114 Workspace Working Calendar 검증 (2026-07-15)

- **UI 변경**: Workspace administration에 `근무 일정` surface를 추가했다. 월~일 근무 요일 선택, 날짜형 휴일 추가·제거, 유효 일정 요약, 저장·되돌리기, loading/error/retry, stale revision 입력 보존과 desktop/mobile 반응형 상태를 제공한다. 장식용 control 없이 모든 명령이 실제 API에 연결된다.
- **기능/API 반영**: migration `0088`이 singleton workspace profile에 JSONB 근무 요일·휴일을 추가하고 array 길이와 요일 닫힌 어휘를 DB에서 제한한다. 인증 사용자는 effective calendar를 읽고 admin만 `If-Match` revision으로 변경한다. 프로젝트 단계 후속 일정은 같은 transaction에서 해당 근무 요일과 휴일을 읽어 다음 근무일·기존 유효 근무일 기간을 계산한다.
- 테스트 fixture가 근무 일정까지 매번 기본값으로 복원해 설정 누수를 막는다. migration 왕복 첫 실행이 naming convention이 downgrade 제약명에 이중 적용되는 결함을 검출했고, `op.f(...)`로 고친 뒤 test DB에서 `0088 -> 0087 -> 0088`과 실제 weekday containment constraint를 확인했다.
- 검증: API focused 22 및 full 735 PASS(기존 Alembic 경고 1건), Ruff/format PASS, OpenAPI generation/drift PASS, typecheck/lint/build PASS(기존 Fast Refresh 4·chunk 경고), unit 93, component 8, focused E2E 1 PASS, full E2E 282 PASS + opt-in visual QA 1 skip, clean-room frontend 161/backend 45, npm/pip audit 0 vulnerabilities, diff check PASS.
- Chromium 증적은 `docs/screenshots/redevelopment/workspace-working-calendar-ui/{desktop,mobile}.png`에 보존한다. Migration `0088` 적용이 필요하다. 환경변수와 dependency 변경은 없다.
- **이연 항목**: phase 활성화 전환 시 자동 재배치와 workspace custom phase definition 관리는 다음 lifecycle surface로 유지한다.

---

# UI-115 Project Phase Activation Scheduling 검증 (2026-07-15)

- **UI 변경**: Project Settings의 단계 활성화 switch가 실제 서버 응답을 기준으로 `재배치됨`과 `저장 날짜 유지` 결과를 구분해 알린다. 기존 월-금 고정 문구를 `워크스페이스 근무일 자동 일정`으로 바로잡고 종료일 저장과 저장 일정 활성화의 적용 범위를 함께 설명한다. Desktop/mobile에서 활성화된 현재 단계와 연쇄 이동된 후속 단계가 같은 refetch 결과로 갱신된다.
- **기능/API 반영**: 이미 비활성 상태로 저장된 완전한 단계 일정에만 활성화 전환 재배치를 적용한다. 이전 활성 단계의 종료 다음 유효 근무일로 시작을 옮기고 유효 근무일 기간을 보존하며, 뒤의 완전한 활성 일정도 같은 규칙으로 연쇄 정렬한다. 활성화와 날짜 입력을 한 요청으로 수행한 경우, 부분·무일정, 기준 종료일 없음, 비활성화, 근무일 0일 일정은 입력·저장 날짜를 보존한다.
- 기존 owner-only PATCH, member read, project row lock과 archive 재확인, optimistic version, true no-op, workspace calendar row lock, 날짜 overflow atomic 422를 유지한다. 독립 reviewer가 부분 후속 일정 이동, 근무일 0일 변환, stale cache 기반 UI 추정 3건을 발견했고 각각 보존·중단 규칙과 서버 응답 기반 피드백으로 수정한 뒤 P0-P2 잔여 없음으로 닫았다.
- 검증: API focused 11 및 full 737 PASS(기존 Alembic 경고 1건), Ruff/format PASS, OpenAPI drift PASS, typecheck/lint PASS(기존 Fast Refresh 경고 4건), unit 93, component 8, production build PASS(기존 chunk 경고), focused E2E 1 및 격리 worktree full E2E 283 PASS + opt-in visual QA 1 skip, clean-room frontend 161/backend 45, npm/pip audit 0 vulnerabilities, diff check와 desktop/mobile visual QA PASS.
- Chromium 증적은 `docs/screenshots/redevelopment/project-phase-activation-ui/{settings-desktop,settings-mobile}.png`에 보존한다. 신규 route, DB schema/migration, environment variable, permission registry, dependency 변경은 없다.
- **이연 항목**: workspace custom phase definition administration만 다음 독립 lifecycle surface로 유지한다.

---

# UI-116 Workspace Project Phase Definition Administration 검증 (2026-07-15)

- **UI 변경**: Workspace administration에 `프로젝트 단계` surface를 추가했다. 관리자는 안정 키 4개를 유지하면서 compact list에서 표시명·색상·순서를 변경하고 저장·되돌리기할 수 있다. Loading/error/retry, local validation, 저장 중 잠금, 412 stale 편집 보존, updater metadata와 desktop/mobile overflow 상태를 제공하며 모든 control은 실제 API에 연결된다.
- **기능/API 반영**: migration `0089`가 singleton Workspace profile에 exact four-item JSONB 단계 정의를 추가한다. 인증 사용자는 effective definitions를 읽고 admin만 strong `If-Match` revision으로 원자 변경한다. 이름은 trim/1-40/대소문자 무시 중복 금지, key set과 color는 닫힌 어휘다. Project Settings·Overview·gate label·단계 겹침 검증·근무일 후속 일정은 저장된 동일 순서를 즉시 소비하며 기존 프로젝트의 active/date/gate/version 값은 바꾸지 않는다.
- 새 엔드포인트 자체의 428/403/422/412와 concurrent writers `200/412`, 두 프로젝트 즉시 전파, per-project state/date/gate/version 보존, reorder scheduler를 API 테스트로 고정했다. Frontend E2E는 첫 저장 412 뒤 local edit와 최신 revision을 유지해 재저장하고 Project Settings/Overview 및 모바일 하단 명령까지 같은 정의를 확인한다.
- 검증: API Ruff/format PASS, focused API 21 PASS와 product-code 변경 후 full API 741 PASS(기존 Alembic 경고 1건), migration `0089 -> 0088 -> 0089` 및 constraint-name 검사 PASS, OpenAPI generation/drift PASS, typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), unit 93, component 8, production build PASS(기존 chunk 경고), focused E2E 1 PASS, CI-mode full E2E 284 PASS + opt-in visual QA 1 skip, clean-room frontend 161/backend 45, npm/pip audit 0 vulnerabilities, diff check와 desktop/mobile visual QA PASS.
- Chromium 증적은 `docs/screenshots/redevelopment/workspace-phase-definitions-ui/{desktop,mobile,mobile-bottom}.png`에 보존한다. Sol reviewer fallback은 tool-call budget에서 verdict 없이 종료되어 root가 migration/authz/CAS/lock order/scheduler/stale UI와 전체 diff를 재검토했고 P0-P2 잔여 결함을 찾지 못했다.
- Migration `0089` 적용이 필요하다. 환경변수와 dependency 변경은 없다. **이연 항목**은 안정 키/단계 수 자체를 바꾸는 동적 workflow schema뿐이며, 현재 4단계 기능이나 UI에 dead control로 노출하지 않는다.

---

# UI-117 Dynamic Workspace Project Phase Schema 검증 (2026-07-15)

- **UI 변경**: Workspace `프로젝트 단계` surface에서 custom 단계를 생성하고 built-in과 함께 이름·색상·순서를 편집할 수 있다. Custom 단계는 확인 후 은퇴하고 별도 보존 목록에서 같은 키로 복원한다. Project Settings는 은퇴 단계의 active/date/gate/version을 읽기 전용으로 표시하고, Overview와 자동 일정은 활성 정의만 사용한다. Loading/error/stale, 최대 수량, desktop/mobile과 Quick Dock 비겹침을 실제 control로 검증했다.
- **기능/API 반영**: migration `0090`은 project phase key를 built-in 또는 서버 생성 `custom_<32 hex>`로 확장하고 Workspace JSONB 정의에 `retired`를 추가한다. Built-in 4개는 삭제·은퇴할 수 없고 custom key는 생성 후 불변이다. Admin create/rename/color/order/retire/restore는 동일 Workspace revision과 strong `If-Match`를 사용하며 active 12개·전체 32개, 이름/키 중복과 active-before-retired 순서를 제한한다.
- 프로젝트는 정의 조회만으로 row를 대량 생성하지 않고 version 0 inactive 상태를 합성한다. Owner가 처음 변경할 때만 row를 채택한다. Retire는 정의와 project row를 삭제하지 않으며 project write는 409로 차단하고, 복원 후 이전 active/date/gate/version을 그대로 재사용한다. Project update와 retire 경합은 update-before-retire의 보존 또는 retire-before-update의 409 둘 중 하나로 원자 수렴한다.
- Migration은 custom definition 또는 project row가 있으면 0089 downgrade를 명시적으로 거부해 데이터 손실을 막는다. 실제 PostgreSQL에서 `0089 -> 0090 -> 0089 -> 0090`, server default, custom-data downgrade guard를 확인했다.
- 검증: API Ruff/format PASS, focused API 34 PASS와 full API 746 PASS(기존 Alembic 경고 1건), OpenAPI generation/drift PASS, typecheck/lint PASS(기존 Fast Refresh 경고 4건), unit 93, component 8, production build PASS(기존 chunk 경고), focused E2E 2 PASS, 최종 full E2E 285 PASS + opt-in visual QA 1 skip, clean-room frontend 161/backend 45, npm/pip audit 0 vulnerabilities와 desktop/mobile visual QA PASS.
- Chromium 증적은 `docs/screenshots/redevelopment/dynamic-project-phases-ui/{desktop,mobile}.png`에 보존한다. Sol reviewer fallback은 독립 verdict 전에 종료되어 root가 migration downgrade guard, admin authz/CAS, project/workspace lock order, retire race, lazy adoption, scheduler와 전체 diff를 재검토했고 잔여 P0-P2 결함을 찾지 못했다.
- Migration `0090` 적용이 필요하다. 환경변수, 설정 UI 노출 대상, dependency 변경은 없다. **이연 항목**은 없으며 PR CI와 main integration 결과만 merge 후 기록한다.

---

# UI-118 Initiative Ownership Continuity 검증 (2026-07-15)

- **UI 변경**: Initiatives 카드에 현재 소유자의 소유권 관리 패널과 owner 부재·비활성 상태의 복구 표시/claim 명령을 추가했다. 후보 loading, 조회 실패와 실제 재시도, 빈 후보, 선택·확인·이전 실패, claim 충돌·재시도, pending, desktop/mobile과 수평 overflow 상태를 실제 API에 연결했다.
- **기능/API 반영**: 현재 owner만 호출자가 볼 수 있는 연결 프로젝트의 활성 멤버 후보를 조회하고 소유권을 이전한다. Owner가 없거나 비활성이면 연결 프로젝트의 active owner-role 멤버만 claim할 수 있다. Initiative row lock, commit 시점 owner 재검증과 후보 재검증으로 동시 이전/claim은 단일 승자로 수렴하며 기존 visibility와 caller-visible roll-up 경계를 유지한다.
- 후보 조회를 다중 연결 프로젝트에 대해 `IN (SELECT ...)`로 고정하고, inactive/foreign/self 후보 거부, plain member claim 거부, active owner 409, 두 동시 transfer의 `200/404` 단일 승자와 최종 owner를 실제 PostgreSQL 회귀 테스트로 검증했다.
- 검증: API Ruff/format PASS, focused API 19 PASS와 full API 751 PASS(기존 Alembic 경고 1건), OpenAPI generation/drift PASS, typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), unit 93, component 8, production build PASS(기존 chunk 경고), focused E2E 2 PASS, full E2E 286 PASS + opt-in visual QA 1 skip, clean-room frontend 161/backend 45, npm/pip audit 0 vulnerabilities, diff check와 desktop/mobile visual QA PASS.
- Chromium 증적은 `docs/screenshots/redevelopment/initiative-ownership-ui/{desktop,mobile}.png`에 보존한다. 독립 reviewer는 잔여 에이전트 슬롯 때문에 생성되지 않아 root가 authz, existence hiding, candidate scope, lock/race, cache invalidation, error/retry와 전체 diff를 직접 재검토했고 P0-P2 잔여 결함을 찾지 못했다.
- Migration, 환경변수, 설정 UI, dependency 변경은 없다. **이연 항목**은 initiative-level notifications와 work-item 연결이며 현재 소유권 연속성 surface에는 dead control로 노출하지 않는다.

---

# UI-119 Initiative Work Item Scope / Detail 검증 (2026-07-15)

- **UI 변경**: Initiative 이름과 전략 범위 수에서 URL 상태를 보존하는 기능형 상세 drawer를 연다. 연결 작업은 프로젝트·제목·상태·우선순위·기한과 실제 전체 상세 이동을 제공하고, owner는 연결 프로젝트의 후보를 검색해 연결하거나 확인 후 해제할 수 있다. Loading/error/retry/empty, mutation 오류, bounded-count 안내와 desktop/mobile 상태를 실제 API에 연결했다.
- **기능/API 반영**: migration `0091`은 Initiative-Work Package 관계를 연결 프로젝트와 동일 프로젝트의 작업으로만 제한하는 복합 FK로 저장한다. Owner-only 연결·해제는 Initiative row lock 뒤 membership과 연결 프로젝트를 재검증하고, member read는 호출자가 볼 수 있는 프로젝트의 작업 상세만 반환한다. 권한 밖 연결은 총수로만 알리고 제목·프로젝트·식별자는 숨긴다. 프로젝트 연결 해제나 작업 삭제 시 관계는 cascade된다.
- API 테스트는 후보 검색, 중복 409, 비연결 프로젝트 404, owner-only write, member visibility, hidden-row 비노출과 project-disconnect cleanup을 고정했다. E2E는 후보 조회 실패·재시도, 검색, 연결·해제, URL/Escape lifecycle, mobile member read-only와 수평 overflow를 검증했다.
- 검증: API Ruff/format PASS, focused API 12 및 full API 753 PASS(기존 Alembic 경고 1건), migration full upgrade→base downgrade→head upgrade PASS, OpenAPI generation/drift PASS, typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), unit 93, component 8, production build PASS(기존 chunk 경고), focused E2E 2 PASS, full E2E 288 PASS + opt-in visual QA 1 skip, clean-room frontend 161/backend 45, npm/pip audit 0 vulnerabilities, diff check와 desktop/mobile visual QA PASS.
- Chromium 증적은 `docs/screenshots/redevelopment/initiative-work-items-ui/{desktop,mobile}.png`에 보존한다. 독립 reviewer는 에이전트 thread limit으로 생성되지 않아 root가 복합 FK/cascade, existence hiding, membership leak guard, owner-transfer race lock, pagination/count, cache invalidation과 전체 diff를 재검토했고 P0-P2 잔여 결함을 찾지 못했다.
- Migration `0091` 적용이 필요하다. 환경변수, 설정 UI와 dependency 변경은 없다. **이연 항목**은 initiative-level notifications이며 현재 상세 surface에는 dead control로 노출하지 않는다.

---

# UI-120 Initiative Subscriptions / Notifications 검증 (2026-07-16)

- **UI 변경**: Initiative detail drawer에 실제 `Follow`/`Following` 전환, mutation pending, 오류·재시도와 follower count를 추가했다. Personal notification settings에는 이니셔티브 알림 토글을 추가했고, Inbox는 initiative 이름과 직접 target을 표시해 `/initiatives?initiative={id}`로 이동한다. Desktop/mobile에서 drawer·settings·inbox 상태와 수평 overflow를 실제 API에 연결해 검증했다.
- **기능/API 반영**: migration `0092`는 durable self-subscription과 initiative notification target/kinds, 개인 `initiatives` preference를 추가한다. 상태·헬스·소유권·work-item scope 변경 시 actor를 제외하고 활성 사용자, 현재 이니셔티브 visibility와 현재 preference를 fan-out 시점에 재검증한다. 삭제는 subscription/notification target을 정리하며 project identity를 임의로 만들거나 hidden project/work-item 정보를 노출하지 않는다.
- 독립 reviewer가 발견한 inbox 조회 시 현재 visibility 재검증 누락, E2E의 initiative 이동 뒤 inbox control 사용, mixed project/initiative target 제약 회귀 검증 누락을 수정했다. Inbox list와 unread count에 동일한 owner-or-connected-project membership 필터를 적용하고, E2E lifecycle을 실제 화면 순서로 고쳤으며 잘못된 mixed target row가 DB constraint로 거부됨을 고정했다.
- 검증: API Ruff/format PASS, focused API 28 및 clean full API 758 PASS(기존 Alembic 경고 1건), migration `0092 -> 0091 -> 0092` PASS, OpenAPI shared types drift PASS, web unit 95·component 8, typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk 경고), focused E2E 4 및 clean full E2E 288 PASS + opt-in visual QA 1 skip, clean-room frontend 161/backend 45, npm/pip audit 0 vulnerabilities와 diff check PASS.
- Chromium 증적은 `docs/screenshots/redevelopment/initiative-notifications-ui/{desktop,mobile}.png`에 보존한다. Migration `0092` 적용이 필요하고 환경변수·dependency 변경은 없다. 설정 UI 변경은 개인 이니셔티브 알림 토글이며 재기동은 필요 없다. **이연 항목**은 외부 SMTP/email delivery로, 현재 in-app surface에는 dead mail control을 추가하지 않았다.

---

# UI-110F Login Fidelity Closure 검증 (2026-07-16)

- **UI 변경**: 사용자 재검수 기준에 맞춰 로그인 좌측 하단의 과밀한 색면을 밝은 수채화 여백으로 정리하고, 공용 OneFlow 마크를 한 몸체의 청록-파랑-보라 리본으로 다시 그렸다. Kanban은 변형·필터·부유 애니메이션을 제거하고 글자 렌더링을 고정했으며, S-M 협업 경로는 긴 대시와 짧은 박자가 이어지는 곡선 흐름으로 조정했다.
- **기능/API 반영**: 기존 dev login, OIDC provider, assistance request, safe-next, identity cache purge, keyboard/focus, responsive와 reduced-motion 계약을 그대로 보존했다. 협업 경로는 실제 CSS animation 시간이 전진하는지 E2E에서 확인하고, reduced-motion에서는 animation이 제거되는지 함께 고정했다. 신규 API, DB, migration, 권한, 환경변수, dependency와 설정 UI 변경은 없다.
- 실제 Chromium 렌더는 `docs/screenshots/redevelopment/login-fidelity-closure-ui/`의 6개 목표 viewport, desktop/mobile, `comparison-desktop.png`, `comparison-mobile.png`에 보존했다. 기준과 현재 구현을 같은 캔버스에서 대조해 compact panel 비율, 리본 연결감, Kanban 선명도, 하단 여백과 mobile overflow 0을 확인했다.
- 검증: typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk 경고), unit 95, component 8, focused login 3 PASS와 최종 precision 1 PASS. Full E2E는 로그인 관련 전부 포함 287 PASS + opt-in visual QA 1 skip이며 unrelated 자동화 안내 timing 1건이 병렬에서 1회 실패했지만 단일 worker repeat 3/3 PASS로 재현되지 않았다. Clean-room frontend 161/backend 45, npm/pip audit 0 vulnerabilities와 diff check가 PASS했다.
- **이연 항목**: 이 surface 안에는 없다. 외부 IdP·SMTP의 운영 자격증명 검증은 기존 배포 경계이며 이번 시각 보정에서 기능을 축소하거나 dead control을 추가하지 않았다.

---

# UI-121 Intake Decision History 검증 (2026-07-16)

- **UI 변경**: 판정된 Intake 항목에 실제 이력 disclosure를 추가했다. 펼칠 때만 항목별 API를 조회하고 최신순 이전/다음 상태, 보류 기한, 사유, 판정자와 시각을 표시한다. Loading skeleton, 오류/재시도, migration 이전 기록의 명시적 empty 안내, bounded-count 안내, 접기 focus 상태와 390px 모바일 줄바꿈을 제공하며 장식용 control은 없다.
- **기능/API 반영**: migration `0093`은 성공한 판정마다 `intake_decision_history`에 이전/다음 상태, plain-text note, 보류 기한, actor와 시각을 append-only로 저장한다. 기존 조건부 triage UPDATE가 성공한 뒤 같은 transaction에 추가하므로 동시 accept 패자는 Work Package·알림·이력을 모두 rollback하고, 최종 상태 409도 이력을 남기지 않는다. 기존 API가 허용하는 반복 snooze는 각각 별도 판정 이벤트로 보존한다.
- **권한/정보 경계**: 신규 bounded `GET /api/v1/projects/{project_id}/intake/{item_id}/history`는 owner에게 프로젝트 queue 전체, 일반 member에게 자기 제출 항목만 보여준다. 다른 제출자·다른 프로젝트 항목은 404로 숨기고 actor email은 응답하지 않는다. Actor 삭제는 FK `SET NULL`과 `이전 구성원` fallback, 항목 삭제는 cascade로 처리한다.
- **검증**: API Ruff/format PASS, focused Intake 16 및 full API 763 PASS(기존 Alembic 경고 1건), migration `0093 -> 0092 -> 0093` PASS, OpenAPI generation/drift PASS. Web typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk 경고), unit 95, component 8, focused Intake E2E 4 PASS, 최종 full E2E 289 PASS + opt-in visual QA 1 skip. 첫 4-worker full E2E의 unrelated 병렬 timeout 5건은 단일 worker repeat 10/10 PASS 후 2-worker full E2E 전체 green으로 재검증했다.
- Clean-room frontend 161/backend 45, npm/pip audit 0 vulnerabilities와 diff check가 PASS했다. Chromium 증적은 `docs/screenshots/redevelopment/intake-decision-history-ui/{desktop,mobile}.png`에 보존한다.
- Migration `0093` 적용이 필요하다. 환경변수, dependency와 설정 UI 변경은 없다. Migration 이전의 단일 current audit 필드에서 알 수 없는 과거 전이를 추정해 backfill하지 않으며 UI가 현재 판정만 존재함을 명시한다. 구현 가능한 기능 이연 항목은 없다.

---

# UI-122 Cycle Scope Analytics 검증 (2026-07-16)

- **UI 변경**: Cycle row의 실제 번다운 disclosure를 최대/현재(완료 사이클은 마감) 범위, 유입·이탈, 완료량과 범위/잔여 선으로 재구성했다. 정확 추적, 부분 추적 시작일, `정밀 추적 전 · 현재 배정 기준` legacy 모드를 구분하고 loading/error/기간 전 empty, 390px 2열 요약과 desktop 4열 요약을 제공한다. 기존 cross-cycle 막대는 과거 범위를 추정하지 않고 `현재 배정 기준 벨로시티`로 명시했다.
- **기능/API 반영**: migration `0094`는 Cycle별 추적 시작 시각·완전성 경계와 안정 Work Package ID 기반 append-only `cycle_scope_events`를 추가한다. Migration 당시 현재 배정은 하나의 baseline으로만 기록하며 과거 배정 시각을 만들지 않는다. Work Package 생성·복제·성공한 optimistic PATCH·rollover·교차 프로젝트 move가 같은 transaction에 `added`/`removed`를 기록하고, 409 loser나 rollback은 이벤트를 남기지 않는다.
- `GET /api/v1/projects/{project_id}/cycles/{cycle_id}/burndown`은 member read/existence hiding을 유지하면서 일별 범위·잔여·완료, 최대/마감 범위, 유입·이탈과 coverage metadata를 반환한다. 신규/추적 이후 기간은 안정 ID 이벤트로 재구성하고, migration 전에 끝난 Cycle만 기존 current-assignment 계산을 명시적 legacy mode로 제공한다. Baseline은 유입 건수에 포함하지 않는다.
- **검증**: API Ruff/format PASS, focused Cycle/assignment/duplicate/move 20 및 full API 765 PASS(기존 Alembic 경고 1건), 전용 `oneflow_ui122_migration_test` DB에서 0001→0094→base→0094 PASS, OpenAPI generation/drift PASS. Web typecheck/lint/build PASS(기존 Fast Refresh 4·chunk 경고), unit 95, focused Cycle E2E PASS, full E2E 289 PASS + opt-in visual QA 1 skip.
- Clean-room frontend 161/backend 45, pip/npm audit 0 vulnerabilities와 diff check가 PASS했다. Chromium 증적은 `docs/screenshots/redevelopment/cycle-scope-analytics-ui/{desktop,mobile}.png`에 보존한다. Migration `0094` 적용이 필요하고 환경변수, dependency와 설정 UI 변경은 없다.
- **이연 항목**: migration 이전 이름 snapshot에서 배정 시점을 추정하지 않는다. 여러 과거 Cycle을 하나의 정밀 velocity로 다시 계산하는 것은 충분한 추적 완료 Cycle이 축적된 뒤 별도 analytics PR로 진행하며, 현재 UI는 기존 수치를 `현재 배정 기준`으로 숨김없이 표시한다.

---

# UI-123 Document Inline Comments 검증 (2026-07-16)

- **UI 변경**: 문서 본문에서 한 문단 안의 1~500자 텍스트를 선택해 위치가 연결된 코멘트 스레드를 만들 수 있다. 본문 앵커와 스레드는 서로 이동하며 활성 상태를 공유하고, 답글·일반 코멘트·loading/error/retry·viewer/archive read-only·390px 모바일 Quick Dock 비겹침을 같은 surface에서 제공한다. 본문이 수정되거나 앵커가 사라진 과거 스레드는 임의 위치로 옮기지 않고 `본문 변경됨`으로 보존한다.
- **기능/API 반영**: migration `0095`는 기존 page-level comment와 호환되는 nullable anchor UUID/quote를 추가한다. 신규 inline-comment API는 문서 row lock과 optimistic version을 사용해 sanitize된 inert `<span data-comment-anchor>` 본문 변경과 첫 코멘트를 한 transaction으로 저장한다. 답글은 현재 앵커·quote를 검증하되 문서 version을 올리지 않으며, stale/foreign/archive/quote mismatch에서는 문서와 코멘트 어느 쪽도 부분 저장하지 않는다.
- **검증**: API Ruff/format PASS, focused document comment 5 및 full API 768 PASS(기존 Alembic 경고 1건), 전용 `oneflow_ui123_migration_test` DB에서 0001→0095→base→0095 PASS, OpenAPI generation/drift PASS. Web `npm ci`, typecheck, lint, production build PASS(기존 Fast Refresh 4·chunk 경고), unit 95, component 8, focused document E2E 4 PASS, full E2E 291 PASS + opt-in visual QA 1 skip.
- Clean-room frontend 161/backend 45, pip/npm audit 0 vulnerabilities와 diff check가 PASS했다. Chromium 증적은 `docs/screenshots/redevelopment/document-inline-comments-ui/{desktop,mobile}.png`에 보존한다. Migration `0095`와 기존 Tiptap 패키지의 직접 dependency 선언이 필요하며 환경변수·설정 UI 변경은 없다.
- **이연 항목**: 본문 변경 뒤 quote를 추측해 자동 재배치하지 않는다. 스레드 reaction/mention은 기존 Work Item collaboration surface와 별개인 후속 Documents surface로 추적하며, 이번 PR에는 장식용 control이나 미배선 UI를 추가하지 않았다.

---

# UI-124 Document Comment Reactions 검증 (2026-07-16)

- **UI 변경**: 문서의 본문 앵커 스레드와 일반 코멘트 행에 같은 compact reaction bar를 추가했다. 작성 가능한 member는 `👍·👎·🎉·❤️·😄·😕` quick reaction과 단일 custom emoji를 실제 저장·해제할 수 있고, pending 중 중복 입력을 막으며 실패를 surface 안에서 알린다. Viewer와 archived page는 기존 aggregate만 정적으로 표시한다. 390px에서 reaction wrap과 Quick Dock 비겹침을 검증했다.
- **기능/API 반영**: migration `0096`은 `document_comment_reactions`에 comment/user cascade, `(comment_id,user_id,emoji)` 유일성, coarse emoji shape guard를 추가한다. PUT은 `INSERT ... ON CONFLICT DO NOTHING`으로 동시 요청에도 idempotent하고 DELETE도 idempotent하다. 목록은 모든 코멘트의 count와 현재 사용자의 `me`를 한 번에 집계하고 count 내림차순·emoji codepoint 오름차순으로 정렬한다.
- **권한/정보 경계**: reaction read는 기존 Document member visibility를 그대로 따르고, mutation은 document writer와 active-project guard를 통과해야 한다. Viewer는 aggregate를 읽지만 PUT/DELETE는 403, archived project는 409, foreign/ghost comment는 404다. Comment·Document·User 삭제 시 reaction이 남지 않는다.
- **검증**: API Ruff/format PASS, focused Document reaction/viewer 18 및 full API 770 PASS(기존 Alembic 경고 1건), 전용 `oneflow_ui124_migration_test` DB에서 0001→0096→base→0096 PASS, OpenAPI generation/drift PASS. Web typecheck, lint, production build PASS(기존 Fast Refresh 4·chunk 경고), unit 95, component 8, focused reaction/viewer E2E 2 PASS. 첫 full E2E의 unrelated 병렬 timing 실패 2건은 단일 worker repeat 6/6 PASS로 격리했고, API 부하를 분리한 최종 full E2E는 292 PASS + opt-in visual QA 1 skip으로 완료했다.
- Clean-room frontend 161/backend 45, pip/npm audit 0 vulnerabilities와 diff check가 PASS했다. Chromium 증적은 `docs/screenshots/redevelopment/document-comment-reactions-ui/{desktop,mobile}.png`에 보존한다. Migration `0096` 적용이 필요하고 환경변수, dependency와 설정 UI 변경은 없다.
- **이연 항목**: Document mention notification은 Inbox에 first-class document target과 deep link를 먼저 설계해야 한다. 이번 PR에는 dead mention selector를 추가하지 않았다.

---

# UI-125 Document Comment Mentions 검증 (2026-07-16)

- **UI 변경**: 공유 Document의 첫 인라인 코멘트, 본문 스레드 답글, 일반 코멘트에 현재 프로젝트 멤버를 선택하는 compact 구조화 mention picker를 연결했다. 저장된 accepted mention은 코멘트 아래 badge로 표시하며 viewer·private Document·archived project에는 쓰기 control을 노출하지 않는다. Inbox는 Document 제목과 `문서` target을 표시하고 `/projects/{project_id}/documents/{document_id}`로 직접 이동한다.
- **기능/API 반영**: migration `0097`은 기존 Document comment에 nullable JSONB accepted mention set과 Notification의 first-class `document_id`/`document_mention` target을 추가한다. Document ID와 project ID는 복합 FK로 같은 프로젝트임을 DB에서도 강제한다. 일반·인라인 코멘트는 self, 중복, 비멤버, 비활성 사용자와 현재 Document를 볼 수 없는 대상을 제거하고, accepted set 저장과 preference-aware in-app notification fan-out을 코멘트 write와 같은 transaction에서 수행한다. `mention` 개인 설정은 delivery만 억제하며 accepted set은 그대로 보존된다.
- **권한/정보 경계**: Inbox list와 unread count는 조회 시점의 현재 프로젝트 membership과 Document visibility를 다시 적용한다. 멤버십 상실 또는 Document 삭제 뒤에는 알림이 보이지 않고, Document 삭제는 target notification을 cascade한다. Private Document는 작성자만 볼 수 있으므로 actor exclusion 뒤 다른 수신자를 만들지 않는다. 외부 email delivery는 이 in-app surface 밖에 둔다.
- **검증**: API Ruff/format PASS, focused Document mention/reaction/viewer 26 및 full API 773 PASS(기존 Alembic 경고 1건), 전용 `oneflow_ui125_migration_test` DB에서 0001→0097→base→0097 PASS, cross-project Document target DB 거부 PASS, OpenAPI generation/drift PASS. Web typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk 경고), unit 96, component 8, focused Document E2E 3개 경로와 reply repeat 4 PASS, 최종 full E2E 293 PASS + opt-in visual QA 1 skip.
- Clean-room frontend 161/backend 45, npm/uv audit 0 vulnerabilities와 diff check가 PASS했다. Chromium 증적은 `docs/screenshots/redevelopment/document-mentions-ui/{desktop,mobile}.png`에 보존한다. Migration `0097` 적용이 필요하며 환경변수, dependency와 신규 설정 UI 변경은 없다.

---

# UI-126 Personal Overdue Reminder Cadence 검증 (2026-07-17)

- **UI 변경**: Personal Settings의 기존 `기한 알림` 아래에 첫 초과 알림 1회 또는 첫 알림 후 3/7/14일마다를 선택하는 기능형 control을 추가했다. 마스터 토글이 꺼지면 주기 선택을 비활성화하고 이유를 설명하며, loading skeleton, 오류·실제 재시도, 저장 pending/success/error와 390px 모바일 줄바꿈을 제공한다. 장식용 email control은 없다.
- **기능/API 반영**: migration `0098`은 `user_notification_settings.overdue_reminder_days`를 기본값 0과 DB CHECK `0/3/7/14`로 추가한다. API도 같은 closed literal을 사용한다. 기존 daily job은 모든 사용자에게 최초 초과일 1회, 명시적 주기 사용자에게 `days_overdue = 1 + n * cadence`인 날만 같은 `overdue` 인앱 알림을 생성한다. 기본 사용자의 오래된 초과 작업은 배포 시 백필되지 않는다.
- **보존한 경계**: current assignee, current project member, active user, active project, open status, `due_alerts` preference, UTC same-day dedupe, advisory lock `427007`, dry-run/create CLI와 actor-null system event 계약을 유지한다. 주기를 선택해도 실행하지 못한 날짜의 알림을 후일 보충하지 않는다.
- **검증**: API Ruff/format PASS, focused notification/due-alert/constraint 10 및 full API 775 PASS(기존 Alembic 경고 1건), migration `0098 -> 0097 -> 0098`와 full `0098 -> base -> 0098` PASS, 실제 default 0/not-null/DB CHECK 확인, OpenAPI generation/drift PASS. Web typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk 경고), unit 96, component 8, focused E2E 2 PASS.
- Full E2E는 신규 경로 포함 293 PASS + opt-in visual QA 1 skip이었다. 변경과 무관한 상세 헤더 Radix closing animation 1건이 4-worker 병렬에서 1회 실패했으나 단일 worker repeat 3/3 PASS로 재현되지 않았다. Clean-room frontend 161/backend 45, npm/uv audit 0 vulnerabilities와 diff check가 PASS했다.
- 추가 진단용 `alembic check`는 이번 컬럼이 아니라 기존 model metadata에 선언되지 않은 `dashboard_layouts`와 여러 legacy index/constraint를 전역 제거 후보로 보고 실패했다. 이 저장소 baseline drift는 이번 PR에서 확장하지 않았으며, UI-126 migration은 위 전용 왕복·constraint-name test·실제 PostgreSQL 제약 조회로 별도 검증했다.
- Chromium 증적은 `docs/screenshots/redevelopment/overdue-reminders-ui/{desktop,mobile}.png`에 보존한다. Migration `0098` 적용이 필요하다. 환경변수, dependency와 권한 변경은 없고 설정 UI 대상은 일반 사용자의 개인 계정이다. 재기동은 migration 적용 외 별도 필요가 없다. **이연 항목**은 실제 SMTP/email delivery뿐이며 운영 자격증명과 transport 정책이 필요한 별도 surface다.

---

# UI-127 Project Shared Dashboard Layouts 검증 (2026-07-17)

- **UI 변경**: Dashboard 상단에 현재 적용 출처(`개인 레이아웃`/`프로젝트 공유`/`기본 레이아웃`), 공유 revision·작성자·시각과 실제 관리 action을 표시한다. 기존 위젯 편집은 개인 저장으로 유지하고, active-project owner는 같은 초안을 공유로 게시·갱신할 수 있다. 개인 사용자는 공유/기본으로 reset하며 owner는 두 단계 확인 후 공유 구성을 삭제한다. Loading/error/pending, 409 stale draft 보존·새 버전 불러오기, archived read-only와 390px 모바일 줄바꿈을 실제 API에 연결했다.
- **기능/API 반영**: migration `0099`는 프로젝트별 단일 `dashboard_shared_layouts` row에 비어 있지 않은 닫힌 위젯 어휘, 양수 version, updater ID `SET NULL`과 이름 snapshot을 저장한다. Effective resolver는 personal > shared > built-in 순서를 고정한다. 개인 PUT/DELETE는 기존 viewer·archive-exempt preference이고, 공유 PUT/DELETE는 active project owner-only, project/shared row lock과 expected version 409를 사용한다. 공유 삭제는 어떤 개인 override도 삭제하지 않는다.
- **권한/무결성**: non-member는 개인/공유 경로 모두 404, member/viewer는 공유 쓰기 403이지만 개인 저장·reset은 가능하다. Archived project는 공유 쓰기 409이나 effective read와 개인 preference는 유지한다. Project 삭제는 shared row를 cascade하고 updater 삭제는 snapshot 이름을 보존한다. Permission registry에 개인 DELETE와 owner-only 공유 PUT/DELETE를 등재했다.
- **검증**: API Ruff/format, focused Dashboard/permission 19, full API 780, migration `0099 -> 0098 -> 0099`와 `base -> 0099 -> base -> 0099`, OpenAPI generation/drift, web typecheck/lint/build, unit 96, component 8, focused Dashboard E2E가 PASS했다. Lint는 기존 Fast Refresh 경고 4개, build는 기존 chunk-size 경고만 유지한다.
- 첫 4-worker full E2E는 신규 흐름 포함 293 PASS + opt-in visual QA 1 skip이고, 변경과 무관한 webhook 새로고침 timing 1건만 실패했다. 해당 케이스는 single-worker repeat 3/3 PASS로 재현되지 않았고, 최신 테스트 정의를 포함한 최종 2-worker full E2E는 294 PASS + opt-in visual QA 1 skip으로 완료했다. Clean-room frontend 161/backend 45, pip/npm audit 0 vulnerabilities와 OpenAPI/diff gate가 PASS했다.
- 추가 진단 `alembic check`는 UI-126 때 누락됐던 `dashboard_layouts` metadata drift가 모델 등록으로 해소됐음을 확인했다. 남은 실패는 기존 `data_transfer_jobs` unique/index와 meetings/project-health/time/work-package legacy index 8건의 전역 metadata drift뿐이며 UI-127 migration과 무관하다.
- Chromium 증적은 `docs/screenshots/redevelopment/shared-dashboard-layouts-ui/{desktop,mobile}.png`에 보존한다. Migration `0099` 적용이 필요하다. 신규 환경변수, dependency, 재기동 또는 별도 Settings UI 변경은 없다. **이연 항목**은 없다.

---

# UI-128 Import Assignee Account Mapping 검증 (2026-07-17)

- **UI 변경**: Jira/Linear CSV dry-run 뒤 distinct `Assignee` 원본 값, 사용 건수, 정확한 이메일 제안과 현재 활성 project owner/member 선택 목록을 Import drawer에 표시한다. 각 원본 값은 사용자가 직접 멤버 또는 미배정으로 결정해야 실행 버튼이 활성화된다. 제안 적용, 결정 진행률, pending/error/409 retry, desktop/mobile no-overflow를 실제 mutation과 연결했다.
- **기능/API 반영**: Adapter row가 Assignee 원본 값을 보존하고 Reporter/Creator는 담당자와 다른 의미이므로 advisory note로만 남긴다. 응답은 원본 identity와 assignable roster를 current project scope로 반환한다. Commit은 exact upload-text SHA-256, complete/unique mapping keys, active owner/member role을 기존 import lock 아래에서 재검증하고 selected `assignee_id`를 Work Package 생성 transaction에 포함한다. Viewer·비활성·외부 사용자, stale content, incomplete/unknown mappings와 255자 초과 identity는 거부한다.
- 기존 scalar reconciliation checksum, row-level validation/isolation, disabled type rejection, Jira/Linear status/type/priority/date mapping, duplicate subject guard, concurrent same-file convergence와 Data Transfer job audit/notes를 유지한다. Exact-email은 화면 제안일 뿐 서버가 암묵 적용하지 않으며 display-name/fuzzy matching은 없다.
- 집중 검증: Jira/Linear/OneFlow CSV와 Data Transfer API 38 PASS, full API 782 PASS(기존 Alembic deprecation warning 1건), Ruff/format PASS, OpenAPI generation/drift PASS. Web typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk-size 경고), unit 96 PASS, focused Import E2E 2 PASS, 최종 full E2E 294 PASS + opt-in visual QA 1 skip이다. API는 exact-email suggestion, explicit mapping, stale checksum 409, missing mapping, viewer/inactive rejection, explicit unassigned, duplicate re-upload와 concurrent 200/200 단일 생성을 검증한다.
- Clean-room frontend 161/backend 45, pip/npm audit 0 vulnerabilities와 diff check가 PASS했다.
- Chromium 증적은 `docs/screenshots/redevelopment/import-assignee-mapping-ui/{desktop,mobile}.png`에 보존한다. 신규 migration, environment variable, dependency, permission registry 또는 별도 Settings UI 변경은 없다. **이연 항목**은 GitHub/Asana/Notion의 외부 형식/credential 기반 adapter뿐이며 UI-128 내부 기능에는 이연이 없다.

---

# UI-129 File Content Search 검증 (2026-07-17)

- **UI 변경**: `/search`와 global command palette에 `파일` group/tab을 추가하고 filename/body match, plain-text snippet과 실제 `/projects/{project_id}/files?file={attachment_id}` 이동을 연결했다. Files 표면은 검색 결과 파일을 강조하고 업로드별 `검색 가능/준비 필요/형식 제외/용량 제외/텍스트 오류/파일 누락` 상태, indexed/total 요약과 실제 legacy 재인덱스 action/result/error를 표시한다.
- **기능/API 반영**: migration `0100`은 `search_text`, explicit index status와 indexed timestamp를 추가하고 기존 LocalStorage 업로드를 `pending`, URL row를 `not_applicable`로 backfill한다. 새 업로드는 blob 저장 뒤 같은 요청에서 closed UTF-8 text-family allowlist(`text/plain`, Markdown, CSV, TSV, JSON)를 최대 512 KiB만 읽어 정규화한다. 검색 요청은 원본 blob을 열지 않는다.
- `POST /api/v1/projects/{project_id}/attachments/search-index/rebuild`는 active writer와 advisory lock, row lock 아래 한 요청에 최대 100개 pending row만 같은 extractor로 처리하고 `processed/indexed/remaining/statuses`를 반환한다. Permission registry의 `work.write`에 등재했다. Binary, oversize, invalid UTF-8/structured text와 missing blob은 명시적 terminal state가 되며 OCR/PDF/object-store content는 추측해 읽지 않는다.
- **권한/정보 경계**: 파일 검색, Files 목록과 reindex 처리/남은 건수는 active project membership, private Document 작성자 가시성, archived Document, Wiki policy를 동일하게 적용한다. Hidden private/Wiki-disabled pending file은 다른 사용자의 `processed/remaining`에도 나타나지 않는다. Viewer reindex는 403, non-member는 기존 existence hiding, archived project write는 409다.
- **검증**: API Ruff/format PASS, focused attachment/search/wiki/private/viewer/permission 62 PASS, full API 789 PASS(기존 Alembic deprecation warning 1건), migration `0099 -> 0100 -> 0099 -> 0100` PASS, OpenAPI generation/drift PASS. Web typecheck/lint/build PASS(기존 Fast Refresh 4건·chunk-size 경고), unit 96, component 8, focused file search/reindex/command palette E2E 4 PASS, 최종 full E2E 296 PASS + opt-in visual QA 1 skip.
- Clean-room frontend 161/backend 45, pip/npm audit 0 vulnerabilities와 diff check가 PASS했다. Chromium 증적은 `docs/screenshots/redevelopment/file-content-search-ui/{search-mobile,files-mobile}.png`에 보존한다. Migration `0100` 적용이 필요하며 신규 환경변수, dependency 또는 별도 Settings UI 변경은 없다.
- **이연 항목**: OCR, PDF와 외부 object-store 본문 추출은 별도 parser/storage capability와 운영 비용·보안 정책이 필요해 명시적으로 제외한다. 지원 text-family LocalStorage 파일의 검색 흐름에는 장식용 control이나 내부 기능 이연이 없다.

---

# UI-151 Login Origin Pixel Reinspection 검증 (2026-07-18)

- **UI 변경**: 사용자 승인 `1448x1086` OneFlow 원본을 런타임 기준 자산과 동일 바이트로 교체하고, 좌측 수채화·두 브랜드 lockup을 같은 원본에서 렌더링한다. 기능형 인증 DOM은 브랜드 1px, 제목/부제, 입력 높이, 폼 간격, provider/create/footer 위치와 숨김 비밀번호 아이콘을 기준 이미지에 맞춰 보정했다.
- **기능/API 반영**: dev/OIDC 인증, validation, assistance request, locale, password visibility, reduced-motion, safe-next와 identity cache reset 계약을 유지했다. 신규 API, DB/schema, migration, permission, environment, dependency 또는 Settings UI 변경은 없다.
- **픽셀 실사**: `1448x1086` Chromium에서 중앙 `1220x915` 패널을 기준 원본과 정규화 비교했다. 전체 MAE `2.016`, 좌측 `0.907`, 인증 surface `3.413`, auth 브랜드 `0.993`이며, max-channel 차이 `<=12` 비율은 각각 `97.02%`, `98.83%`, `94.75%`, `97.61%`다. 비교·증폭 diff와 8개 viewport 캡처는 `docs/screenshots/redevelopment/login-origin-fidelity-ui/`에 보존한다.
- **인앱 실사**: DPR 2 인앱 Browser에서 원본 natural size `1448x1086`, 패널 `1220x915`, card/footer 내부 배치와 문서/canvas 수평 overflow `0`을 확인했다. `390x844` 모바일은 단일 열과 내부 세로 스크롤을 유지한다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk-size 경고), unit 103 PASS, component 8 PASS, focused login E2E 12 PASS, 최종 full E2E 312 PASS + opt-in visual QA 1 skip이다. Clean-room은 frontend 161/backend 45 license와 소스·파일명 격리를 통과했고 `npm audit --audit-level=high`는 취약점 0건이다. **이연 항목은 없다.**

---

# UI-160 Login In-App Pixel Convergence 검증 (2026-07-19)

- **UI 변경**: 인앱 Chromium `1448x1086` 실사에서 인증 카드 내부 세로 스크롤바가 콘텐츠 폭 11px를 점유해 로고·제목·입력·버튼 전체를 왼쪽으로 이동시키던 회귀를 제거했다. 카드의 세로 스크롤 기능은 유지하면서 scrollbar chrome만 숨겼고, 우측 브랜드 crop은 quarter-pixel 단위로 원본 위치에 재정렬했다. 좌측 수채화·브랜드·플로팅 카드와 우측 브랜드는 사용자 승인 원본과 동일 SHA-256 자산을 계속 사용한다.
- **픽셀 실사**: 패널 `1220x915` 정규화 비교에서 전체 MAE는 `3.950 -> 3.253`(-17.6%), 인증 surface는 `5.192 -> 3.651`(-29.7%), 우측 브랜드는 `12.336 -> 2.533`(-79.5%)로 감소했다. 좌측 story MAE `2.923`은 변경 전후 동일해 runtime 원본 자산이 바뀌지 않았음을 확인했다. 카드 `clientWidth === scrollWidth === 439`, scrollbar width `none`, 문서 수평 overflow `0`이다.
- **상호작용/반응형**: dev/OIDC 로그인, assistance request, locale, password visibility, reduced-motion, safe-next와 세로 스크롤 계약을 유지했다. `390x844` 인앱 실사에서 문서 `scrollWidth === clientWidth === 390`, 카드 `clientWidth === scrollWidth === 353`이며 하단 콘텐츠는 페이지 세로 스크롤로 접근 가능하다.
- **검증**: typecheck, lint, production build, unit 107, component 8, focused login E2E 12가 PASS했다. 병렬 full E2E에서 드러난 기존 Document inline-comment route-handler 경쟁 조건은 요청 수 polling으로 안정화했고 관련 Document/Initiative/Releases 9회 반복이 PASS했다. 최종 single-worker full E2E는 315 PASS + opt-in visual QA 1 skip이다. Clean-room frontend 161/backend 45, OpenAPI drift, npm/pip audit 0 vulnerabilities도 PASS했다. 증적은 `docs/screenshots/redevelopment/login-in-app-convergence-ui/`에 보존한다. 신규 API, DB/schema, migration, permission, environment, dependency 또는 Settings UI 변경은 없고 **이연 항목은 없다.**

---

# UI-150 Initiative Activity Detail 검증 (2026-07-18)

- **UI 변경**: Initiative 상세 drawer에 실제 변경 이력을 actor, 안전한 event 요약, 변경 field badge, 시각으로 표시한다. loading skeleton, initial error/retry, empty, next-page error/retry, load-more와 desktop/mobile no-overflow 상태를 제공한다.
- **기능/API 반영**: migration `0107`은 Initiative별 append-only activity relation과 닫힌 kind/field vocabulary, actor `SET NULL`, Initiative cascade를 추가한다. 생성·기본 속성·수명주기·헬스·소유권·라벨·프로젝트 범위·작업 범위 mutation은 실제 변경이 있을 때 같은 transaction에 활동을 기록한다. GET은 current Initiative visibility를 다시 검사하고 bounded newest-first 페이지를 반환한다.
- **정보/권한 경계**: payload에는 연결 프로젝트·작업의 이름, ID, 이전/새 값이 없고 변경 field 이름만 있다. actor 삭제 뒤에도 `이전 구성원`으로 이력을 보존하며 현재 Initiative 가시성을 잃으면 endpoint도 404다. mock/dead control이나 장식용 activity row는 없다.
- **검증**: focused Initiative API 20 PASS(기존 Alembic deprecation warning 1건), migration `0001 -> 0107 -> 0106 -> 0107` PASS, API Ruff/format, OpenAPI generation/drift, web typecheck/lint/build, unit 103, component 8, focused Initiative activity E2E 1, desktop/mobile Chromium 실사, clean-room frontend 161/backend 45, npm audit high 0, diff check PASS. PR #337 CI run `29646989026`과 main integration run `29647272446`도 모두 green이다. **이연 항목은 없다.**

---

# UI-156 Project Schedule Baseline History 검증 (2026-07-19)

- **UI 변경**: Project Overview의 단일 교체형 기준선 표면을 이름 있는 이력 selector, 현재 일정 저장 dialog, 선택 기준선의 변동 요약·상세, 개별 삭제 확인과 quota/empty/loading/error/conflict/member/mobile 상태로 확장했다. 생성 성공 응답은 이력·상세 cache를 함께 갱신하고, 삭제 성공은 해당 상세를 제거한 뒤 다음 최신 기준선을 자동 선택한다. 모든 visible control은 실제 API 요청에 연결된다.
- **기능/API 반영**: migration `0110`은 기존 snapshot을 `기준선 1`로 무손실 승격하고 project/name unique와 project/captured index를 추가한다. newest-first list, named create, selected detail과 optimistic delete를 프로젝트당 20개, 기준선당 5,000개 작업으로 제한한다. 기존 `/schedule-baseline` GET/PUT/DELETE는 최신 기준선 호환 경로로 유지한다.
- **권한/무결성**: owner만 active project에서 생성·삭제할 수 있고 member는 목록·상세·편차를 읽는다. foreign project는 숨기고 archived write는 409다. 프로젝트 advisory lock 아래 quota·중복 이름을 검사하고 삭제 expected version 충돌은 409로 복구한다. Permission registry에도 복수 생성·삭제 경로를 `project.manage`로 등록했다.
- **DB/API 검증**: migration 빈 DB `0109 -> 0110 -> 0109 -> 0110`과 기존 version 3/item 1개 데이터의 `0109 -> 0110 -> 0109 -> 0110` 보존 검증이 PASS했다. API Ruff/format, OpenAPI generation/drift와 기준선·권한 리포트 15 PASS다. 장시간 시작된 full API는 수정 전 import된 permission registry 때문에 coverage 1건이 실패했지만 나머지 822건은 PASS했고, 현재 파일 기준 재실행에서 해당 coverage와 새 기준선 계약이 모두 PASS했다. 기존 Alembic path separator 경고 1건만 유지한다.
- **Web 검증**: typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk-size 경고), unit 107, component 8, focused 기준선 E2E 1 PASS다. 4-worker full E2E는 신규 시나리오 포함 309 PASS + visual manifest 1 skip이고 변경 밖 timing 6건이 실패했으나, 새 서버 single-worker 반복에서 해당 6건이 18/18 PASS해 부하성 변동으로 격리됐다.
- Clean-room frontend 161/backend 45, npm/uv audit 0 vulnerabilities와 diff check가 PASS했다. Chromium 증적은 `docs/screenshots/redevelopment/project-schedule-baseline-history-ui/{desktop,mobile}.png`에 보존한다. Migration `0110` 적용이 필요하며 신규 환경변수, dependency, 재기동 또는 Settings UI 변경은 없다.
- **이연 항목**: portfolio 전체에서 여러 프로젝트의 기준선 이력을 집계·분석하는 reporting surface는 별도 PR로 추적한다. 프로젝트 Overview 안의 기준선 이력 기능에는 장식용 control이나 내부 미배선 이연이 없다.

---

# UI-152 Document Activity Tabs 검증 (2026-07-18)

- **UI 변경**: Document 상세의 기존 본문 앵커/일반 코멘트 기능을 유지하면서 `댓글`/`활동` 탭을 추가했다. 활동은 actor, 안전한 사건 요약, 변경 필드 badge와 시각을 최신순으로 표시하며 loading skeleton, initial error/retry, empty, next-page error/retry, load-more와 390px 모바일 no-overflow 상태를 실제 API에 연결한다.
- **기능/API 반영**: migration `0108`은 Document별 append-only activity relation, 닫힌 kind/changed-field vocabulary, actor `SET NULL`, Document cascade를 추가한다. 생성·제목/본문/상위 페이지/공개 범위 수정·보관·복원과 인라인 코멘트 앵커의 실제 본문 변경만 mutation과 같은 transaction에서 기록한다. 동일 값 저장, stale conflict, 중복 보관/복원과 본문을 바꾸지 않는 답글은 새 활동을 만들지 않는다.
- **정보/권한 경계**: payload는 과거 제목·본문 값이나 프로젝트/문서 식별 정보를 저장하지 않고 변경 필드 이름만 반환한다. GET은 현재 project membership, private author visibility, archived Document read와 Wiki policy를 다시 적용하며 bounded newest-first pagination을 제공한다. actor 삭제 뒤 기록은 `이전 구성원`으로 남고 membership 상실 뒤 endpoint는 404다.
- **검증**: API Ruff/format PASS, focused Document activity/lifecycle/comment 25 및 full API 818 PASS(기존 Alembic deprecation warning 1건), migration `0108 -> 0107 -> 0108`, OpenAPI generation/drift PASS. Web typecheck/lint/build PASS(기존 Fast Refresh 경고 4건·chunk-size 경고), unit 103, component 8, focused activity E2E 1 PASS다. 전체 E2E는 313 PASS + opt-in visual QA 1 skip이며 unrelated project-health retry timing 1건이 병렬 첫 시도에서 flaky였지만 single-worker repeat 3/3 PASS로 격리했다. Clean-room frontend 161/backend 45와 diff check가 통과했다.
- Chromium 증적은 `docs/screenshots/redevelopment/document-activity-tabs-ui/{desktop,mobile}.png`에 보존한다. Migration `0108` 적용이 필요하다. 환경변수, dependency, permission registry 또는 별도 Settings UI 변경은 없다. **이연 항목은 없다.**

---

# UI-153 Document Version History 검증 (2026-07-19)

- **UI 변경**: Document 상세에 기능형 `버전` 탭을 추가했다. 최신순 버전 목록은 작성자·시각·변경 필드·현재 콘텐츠를 표시하고, 선택한 버전의 제목과 본문은 별도 API로 지연 조회해 읽기 전용으로 미리 본다. Writer는 확인 뒤 과거 콘텐츠를 복원할 수 있으며 loading skeleton, initial/detail/next-page 오류와 실제 재시도, empty, pending, 409 안내, desktop/mobile no-overflow를 제공한다.
- **기능/API 반영**: migration `0109`는 Document별 불변 제목/본문 snapshot, 문서 version, actor `SET NULL`, 복원 원본 relation과 Document cascade를 추가한다. 기존 문서는 현재 콘텐츠 한 건만 정직하게 backfill한다. 생성·제목/본문 수정·인라인 코멘트 앵커의 실제 본문 변경·버전 복원만 mutation과 같은 transaction에 snapshot을 남기며, 공개 범위/상위 페이지/보관 상태 변경과 본문을 바꾸지 않는 답글은 콘텐츠 이력을 만들지 않는다.
- 복원 API는 current membership/private visibility/Wiki policy, active project writer와 archived read-only를 다시 검사한다. `expected_version` CAS가 성공할 때만 제목·본문을 바꾸고 새 snapshot과 `document_version_restored` 활동을 같은 transaction에 기록한다. 현재 내용과 같은 복원은 no-op이고 stale 요청은 409이며 공개 범위·상위 페이지·보관 상태는 되감지 않는다. Permission registry에는 기존 `document.write`로 명시 등록했다.
- **검증**: API Ruff/format PASS, focused Document revision/activity/permission 15 PASS, full API **821 PASS**(기존 Alembic deprecation warning 1건), 복원 활동이 존재하는 데이터에서 migration `0109 -> 0108 -> 0109` PASS, OpenAPI generation/drift PASS. Web typecheck/lint/build PASS(기존 Fast Refresh 경고 4건·chunk-size 경고), unit 103, component 8, focused 버전 E2E 1, 최종 full E2E **315 PASS + opt-in visual QA 1 skip**이다. Clean-room frontend 161/backend 45, npm/pip audit 0 vulnerabilities와 diff check가 PASS했다.
- Chromium 증적은 `docs/screenshots/redevelopment/document-version-history-ui/{desktop,mobile}.png`에 보존한다. Migration `0109` 적용이 필요하다. 신규 환경변수, dependency 또는 별도 Settings UI 변경은 없다. **이연 항목**은 두 버전의 inline/side-by-side 차이 비교이며 UI-154에서 별도 기능 surface로 진행한다. 이번 PR에는 미배선 비교 control을 추가하지 않았다.

# UI-154 Document Version Comparison 검증 (2026-07-19)

- **UI 변경**: Document Version 탭에 실제 `버전 비교` surface를 추가했다. 선택한 과거 버전을 기준으로 현재 버전을 바로 비교하며, 기준/비교 revision을 각각 선택하고 방향을 교환할 수 있다. `변경 강조`는 제목·본문의 추가/삭제와 문자 수를 표시하고 큰 문장 교체는 두 줄로 분리한다. `나란히`는 두 sanitized rich-text snapshot을 desktop 2열/mobile 1열로 미리 본다. 닫기, loading, detail 오류/재시도, 같은 revision 선택 차단, keyboard segmented control과 no-overflow를 포함한다.
- **기능/API 반영**: UI-153의 current-visibility authorization을 거친 revision list/detail query를 그대로 재사용한다. 별도 mock 데이터나 중복 compare endpoint를 추가하지 않았다. Snapshot HTML은 브라우저 `DOMParser`로 text만 추출하고 script/style을 제외한 뒤 bounded word/line LCS를 계산한다. 대형 입력은 전체 교체 표현으로 안전하게 축약하며 raw HTML을 변경 강조 콘텐츠로 노출하지 않는다.
- **이연 항목**: 없음. API, DB, permission registry, migration, 환경변수, dependency, Settings UI 변경도 없다.
- **검증**: unit **107 PASS**, component **8 PASS**, typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk-size 경고), focused Document version E2E **1 PASS**, 격리 포트 2-worker full E2E **315 PASS + opt-in visual QA 1 skip**, clean-room frontend161/backend45, npm/pip audit 0 vulnerabilities, diff check PASS다.
- Chromium 증적은 `docs/screenshots/redevelopment/document-version-compare-ui/{inline-desktop,desktop,mobile}.png`에 보존한다. 첫 focused 실행은 보존 중인 사용자용 `5173` 로그인 서버를 재사용해 이전 worktree 화면을 읽었으므로 제품 실패가 아니며, 이후 모든 focused/full 검증은 전용 `5190`/`5191` 포트에서 실행해 PASS했다.

# UI-155 Login Pixel Audit 검증 (2026-07-18)

- **UI 변경**: 사용자 승인 `1448x1086` 원본과 실제 기능형 로그인 DOM을 영역별로 다시 대조했다. 기준보다 아래에 있던 제목과 `or` 구분선을 각각 1 CSS 픽셀 올리고, 숨김 상태를 기준 이미지의 눈과 짧은 우하향 선 형태로 보정했다. 로컬 비밀번호 불필요 설정에서도 아이콘 농도를 유지하지만 버튼의 disabled 계약은 그대로다.
- **보존한 시각 자산**: 좌측 수채화, 상·하단 장식, S자 강, 칸반/달력/활동/진행 카드, 협업 경로와 좌·우 브랜드는 승인 원본과 런타임 자산의 동일 SHA-256 `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`을 계속 사용한다. 재생성·대체·필터 변경이 없다.
- **픽셀 실사**: `1448x1086` Chromium의 중앙 `1220x915` 패널을 원본 크기로 정규화했다. baseline→final MAE는 전체 `2.260→2.188`, 좌측 `1.231→1.231`, 인증 `3.504→3.344`, 브랜드 `1.284→1.284`, 제목 `9.571→6.652`, 비밀번호 행 `5.018→4.950`, 구분선 `4.440→3.782`다. 실제 인앱 Browser `1455x1259`, DPR 2 캡처도 같은 서버에서 확보했다.
- **기능/API 반영**: dev/OIDC, validation, password visibility, assistance request, locale, policy dialog, safe-next, loading/error/disabled와 reduced-motion을 유지했다. 신규 API, DB/schema, migration, permission, environment, dependency 또는 Settings UI 변경은 없다.
- **검증**: 로그인 기능·지원·오류 복구·모바일·8개 viewport·원본/모션 focused E2E 6 PASS, 최종 증적 재촬영 2 PASS, typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk-size 경고), unit 107, component 8, 격리 포트 2-worker full E2E **315 PASS + opt-in visual QA 1 skip**이다. Clean-room frontend 161/backend 45, npm/pip audit 0 vulnerabilities와 diff check도 PASS했다. 증적은 `docs/screenshots/redevelopment/login-pixel-audit-ui/`에 보존한다. **이연 항목**은 없다.

---

# UI-157 Portfolio Schedule Baseline Analytics 검증 (2026-07-19)

- **UI 변경**: 기존 Portfolio report에 최신 일정 기준선 적용률과 일정 주의 프로젝트/작업 합계를 추가했다. 프로젝트 비교는 `전체/주의/변경/미설정` 실제 필터, 최신 기준선 이름·저장일·snapshot 수, 변동/주의 상태를 제공한다. 데스크톱은 compact table, 390px 모바일은 별도 project summary list를 사용하며 프로젝트·기준선 action은 Project Overview의 실제 기준선 섹션으로 이동한다. Timeline loading/error/retry/empty도 같은 surface에서 완결했다.
- **기능/API 반영**: `GET /api/v1/reports/portfolio`와 CSV는 반환된 최대 200개 authorized project ID만 대상으로 최신 기준선을 결정하고, snapshot/current Work Package를 PostgreSQL full outer comparison으로 배치 집계한다. `changed`는 추가·삭제·일정 변동 전체, `risk`는 지연·일정 해제·삭제만 포함한다. 응답은 기준선 metadata·snapshot/changed/risk count와 page totals를 제공하며 Work Package subject나 hidden project history는 반환하지 않는다.
- **권한/경계**: 기존 current-user ProjectMember scope, archive toggle, deterministic project order/pagination을 유지한다. 기준선 비교 쿼리는 이미 반환이 승인된 project ID만 받고 한 aggregate row/project만 반환한다. foreign project에 실제 기준선이 있어도 row와 totals에 포함되지 않는 fixture를 검증했다. DB migration, 환경변수, dependency, permission registry와 Settings UI 변경은 없다.
- **검증**: API portfolio/baseline/timeline/permission focused **24 PASS**, full API **824 PASS**(기존 Alembic path separator 경고 1건), Ruff/format과 OpenAPI generation/drift PASS. Web typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk-size 경고), unit **107**, component **8**, focused Portfolio desktop/mobile E2E **2 PASS**, 2-worker full E2E **315 PASS + opt-in visual QA 1 skip**다.
- Clean-room frontend 161/backend 45, npm/pip audit 0 vulnerabilities와 diff check가 PASS했다. Chromium 증적은 `docs/screenshots/redevelopment/portfolio-schedule-baseline-ui/{desktop,mobile}.png`에 보존한다.
- **이연 항목**: 여러 과거 기준선 사이의 cross-project trend chart는 timestamp series contract와 큰 이력 집계 비용을 별도 설계해야 하므로 후속 Portfolio analytics PR로 추적한다. 이번 최신 기준선 상태/필터/딥링크 surface에는 mock, dead control 또는 미배선 UI가 없다.

---

# UI-158 Project Schedule Baseline Trend 검증 (2026-07-19)

- **UI 변경**: Project Overview의 일정 기준선 이력 위에 오래된 기준선부터 최신 기준선까지 시간순 추세를 추가했다. 각 행은 저장일·비교 작업 수·현재 일정 대비 변동/위험 수와 중첩 막대를 표시하는 실제 버튼이며, 선택하면 기존 권한 검사를 거치는 상세 기준선 selector와 편차 목록이 함께 전환된다. loading/error/retry/empty는 기존 이력 query와 공유하고 390px 모바일에서도 두 기준선 행과 상세가 가로 넘침 없이 유지된다.
- **기능/API 반영**: 기준선 목록은 프로젝트당 최대 20개 history ID만 대상으로 snapshot/current Work Package를 한 번의 bounded aggregate로 비교해 `comparison_total`, `changed_total`, `risk_total`을 반환한다. 비교 분모는 snapshot과 이후 추가 작업의 합집합이며 `changed`는 추가·삭제·일정 변동 전체, `risk`는 지연·일정 해제·삭제만 포함한다. Work Package subject나 과거 상세 payload는 목록에 포함하지 않는다.
- **권한/경계**: 기존 current project membership, owner-only active-project write, archived read와 기준선당 5,000개 current-item 상한을 그대로 적용한다. 추세는 각 과거 시점끼리의 복원된 상태를 주장하지 않고 모든 저장 기준선을 현재 일정과 비교한다는 설명을 화면에 명시했다. 신규 migration, environment variable, dependency, permission registry 또는 Settings UI 변경은 없다.
- **검증**: API 기준선 focused **6 PASS**, full API **824 PASS**(기존 Alembic path separator 경고 1건), Ruff와 OpenAPI generation/drift PASS. Web typecheck PASS, lint PASS(기존 Fast Refresh 경고 4건), production build PASS(기존 chunk-size 경고), unit **107**, component **8**, focused 추세 E2E **1 PASS**, 2-worker full E2E **315 PASS + opt-in visual QA 1 skip**다.
- Chromium 증적은 `docs/screenshots/redevelopment/project-schedule-baseline-trend-ui/{desktop,mobile}.png`에 보존한다. **이연 항목**은 여러 프로젝트의 임의 과거 기준선 범위를 서로 비교하는 organization-wide trend/report builder이며, 현재 Project Overview 추세에는 mock, dead control 또는 미배선 UI가 없다.

---

# UI-159 Portfolio Recent Baseline Trend 검증 (2026-07-19)

- **UI 변경**: Portfolio report에 실제 `기준선 추세` 모드를 추가했다. 기존 일정 필터를 공유하면서 프로젝트별 최근 최대 5개 기준선을 오래된 순서로 배치하고, 저장 작업 수·현재 일정 대비 변동/주의 수·최신 기준선을 표시한다. 이력 없음도 프로젝트별로 보존하며 initial loading, summary와 독립된 error/retry, desktop 5열/mobile 1열과 no-overflow를 제공한다.
- **기능/API 반영**: `GET /api/v1/reports/portfolio/schedule-baseline-trends`는 기존 Portfolio와 같은 current ProjectMember, archive, 이름/ID 정렬, limit/offset 경계를 다시 적용한다. 반환이 승인된 최대 200개 프로젝트와 프로젝트당 최근 1~5개 기준선만 PostgreSQL aggregate로 현재 Work Package 일정과 비교하며, 이력 없는 프로젝트도 빈 `points`로 반환한다. 기존 최신 기준선 Portfolio summary query는 같은 집계의 history limit 1 호환 경로로 유지했다.
- **권한/정보 경계**: 응답은 기준선 ID·이름·시각과 count만 포함하고 Work Package subject, item ID 또는 hidden-project 이력을 노출하지 않는다. 추세 point는 정확한 `?baseline=<id>#schedule-baseline` Project Overview 딥링크로 연결되고, Overview selector는 현재 membership 검사를 거친 뒤 해당 기준선을 선택하며 존재하지 않는 ID는 최신 허용 기준선으로 정규화한다. mock/dead control 또는 장식용 추세점은 없다.
- **검증**: Portfolio API focused **8 PASS**, full API **825 PASS**(기존 Alembic path separator warning 1건), API Ruff/format, OpenAPI generation/drift와 shared type check PASS다. Web typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107**, component **8**, focused/related Portfolio·Overview E2E **5 PASS**, single-worker full E2E **316 PASS + opt-in visual QA 1 skip**다. Clean-room frontend **161**/backend **45**, npm/pip audit 0 vulnerabilities와 diff check도 PASS했다.
- Chromium 증적은 `docs/screenshots/redevelopment/portfolio-baseline-trend-ui/{desktop,mobile}.png`에 보존한다. 신규 migration, environment variable, dependency, permission registry 또는 Settings UI 변경은 없다. **이연 항목**은 임의 기준일·사용자 지정 기간과 차원/pivot report builder이며, 현재 최근 기준선 추세 surface는 기능적으로 완결됐다.

# UI-162 Login Origin DPR Closure 검증 (2026-07-19)

- **UI 변경**: 사용자가 승인한 `1448x1086` OneFlow 로그인 원화의 정확한 `792:656` story/auth 분할을 적용하고, DPR 2/3에서도 저해상도 1x 원화를 확대하지 않도록 결정적 `2896x2172` 2x 자산과 `srcSet`을 추가했다. 좌측 수채화·브랜드·칸반·달력·활동·진행·후기 구성은 동일 원본을 사용하고, 우측 브랜드도 동일 자산의 정확한 crop을 유지한다. 협업 경로는 작은 빛 점이 곡선을 따라 연속 이동하도록 원본 점선 위의 애니메이션을 보정했다.
- **동일성 근거**: `docs/oneflow-login-origin.png`와 runtime 1x 자산의 SHA-256은 모두 `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`이다. 2x 자산은 생성형 재해석 없이 Lanczos로만 확대했으며 Chromium DPR 2/3에서 story와 auth 브랜드 모두 2x source를 실제 선택한다.
- **픽셀 전수 실사**: baseline/final에 동일한 `auth/config`, locale, light theme, reduced-motion을 적용했다. `1448x1086` DPR 2의 중앙 `1220x915` 패널을 원본으로 정규화한 전체 MAE는 `2.725 -> 2.683`, 좌측 전체 `2.096 -> 2.015`, 상단 장식 `1.179 -> 1.090`, 좌측 브랜드 `4.331 -> 4.219`, 헤드라인 `4.661 -> 4.395`, 칸반 `2.318 -> 2.238`, 산·S자 물길 `2.104 -> 2.055`, 활동 카드 `3.073 -> 2.986`, 하단 식물·물결 `2.198 -> 2.133`, 우측 브랜드 `1.614 -> 1.534`다. 기능형 auth DOM의 브라우저 글꼴/컨트롤 raster 차이는 baseline 대비 영역별 `+/-0.104` MAE 안에서 유지된다.
- **반응형/기능**: 데스크톱 document overflow는 x/y 모두 0이고, `390x844` DPR 3 모바일은 `scrollWidth === clientWidth === 390`이며 전체 기능이 한 viewport에 배치된다. dev/OIDC, password visibility, locale, assistance, safe-next, validation, loading/error와 keyboard focus 계약은 그대로 유지한다. 신규 API, DB/schema, migration, permission, environment, dependency 또는 Settings UI 변경은 없다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, focused login E2E **12 PASS**, 최종 full E2E **316 PASS + opt-in visual QA 1 skip**이다. Clean-room frontend **161**/backend **45**, npm audit high 0 vulnerabilities와 diff check도 PASS했다. 첫 clean-room 실행은 격리 worktree에 API `.venv`가 없어 backend scan을 skip해 fail-closed됐고, 동일 잠금환경 `.venv`를 연결한 재실행에서 4단계 전부 PASS했다.
- **증적**: `docs/screenshots/redevelopment/login-origin-dpr-closure-ui/`에 desktop/mobile 실제 캡처, 원본-런타임 정규화 대조, 5x pixel diff와 측정 계약을 보존한다.

---

# UI-161 Workspace Branding 검증 (2026-07-19)

- **UI 변경**: 워크스페이스 일반 설정에 PNG/JPEG/WebP 로고 선택, 저장 전 미리보기, 교체, 삭제, 진행·오류·충돌 상태를 추가했다. 저장 성공 시 React Query identity cache를 원자적으로 갱신해 상단 워크스페이스 전환기, 전환 popover, 데스크톱 사이드바와 모바일 헤더에 즉시 반영하며 이미지 로드 실패 또는 미설정 상태는 워크스페이스 이름 기반 두 글자 폴백을 사용한다.
- **기능/API 반영**: migration `0111`은 로고 storage key, MIME, 파일명, 크기와 byte size를 WorkspaceProfile revision에 결합한다. 관리자 전용 PUT/DELETE는 `If-Match` CAS, 2 MiB stream 상한, PNG/JPEG/WebP 실제 decode, 정적 이미지·4096 edge·8M pixel 검증, 새 blob rollback과 교체 후 이전 blob 정리를 수행한다. 인증된 GET은 blob UUID 버전 URL, private immutable cache와 `nosniff`로 현재 blob을 반환하고, 이름 변경에는 URL이 유지되지만 교체 뒤 이전 버전 URL은 404가 된다. Storage sweep은 현행 로고 key를 live reference로 보존한다.
- **권한/무결성**: 일반 사용자는 로고를 읽을 수 있지만 변경 API는 403이다. stale revision은 412와 최신 revision을 반환하고, 실패한 업로드는 새 blob을 제거하며 DB commit 전에 기존 blob을 삭제하지 않는다. PUT/DELETE 경로는 관리자 전용 workspace identity 변경으로 permission audit allowlist에 등록했다. LocalStorage 외 object store와 임의 theme 색상 편집은 이 surface 범위 밖으로 명시 이연한다.
- **실스택 검증**: PostgreSQL `0111` 적용 API와 Vite UI에서 사용자 제공 PNG를 선택·저장한 뒤 설정 미리보기, 상단, 사이드바와 워크스페이스 popover 반영을 확인했다. DELETE 후 revision 증가와 모든 surface의 `ON` 폴백 복귀도 확인했다. 검증용 CORS origin은 로컬 프로세스에만 주입했고 제품 환경변수는 변경하지 않았다.
- **자동 검증**: focused workspace/storage API **17 PASS**, permission/profile 재검증 **21 PASS**, full API **827 PASS**(기존 Alembic path separator warning 1건), migration `0111 -> 0110 -> 0111`, API Ruff/format, OpenAPI 생성·드리프트와 shared type check가 PASS했다. Web typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, focused workspace E2E **4 PASS**, 최종 2-worker full E2E **318 PASS + opt-in visual QA 1 skip**이다. Clean-room frontend **161**/backend **45**, npm/pip audit 0 vulnerabilities와 diff check도 PASS했다.
- 첫 4-worker full E2E는 기존 프로젝트 단계 화면의 마지막 screenshot 저장만 전체 30초 한도를 넘어 `317 PASS + 1 fail + 1 skip`이었고, 같은 시나리오 단독 실행은 **1 PASS**, 병렬도를 낮춘 전체 재실행은 위의 **318 PASS + 1 skip**으로 완료됐다. 제품 동작 실패나 소스 수정 없이 실행 부하를 분리해 재검증했다.
- **증적**: `docs/screenshots/redevelopment/workspace-branding-ui/{desktop,mobile}.png`에 저장된 로고의 desktop popover와 mobile header를 보존한다. 신규 dependency 또는 영구 environment variable 변경은 없다.

---

# UI-163 Workspace Integrations Hub 검증 (2026-07-19)

- **UI 변경**: Workspace Settings의 개발자 도구에 `연결 및 통합` route와 navigation을 추가했다. 한 compact list에서 Webhooks, 데이터 전송, AI 작업 요약, 인증 상태를 스캔하고 각 기존 관리 화면으로 이동한다. Desktop은 한 행 안에서 상태와 action을 유지하고 390px mobile은 action이 전체 폭으로 내려가며 가로 overflow가 없다.
- **기능 반영**: 네 행은 각각 기존 `GET /webhooks`, `GET /data-transfer-jobs`, `GET /admin/workspace/features/ai`, `GET /auth/config` React Query를 독립 호출한다. Webhook의 enabled/active endpoint/signing key, 실제 데이터 전송 이력과 최근 결과, AI 배포 상한·workspace policy·revision, auth mode·provider 수·session management만 서버 응답대로 표시한다. 한 query가 실패해도 나머지 상태와 action은 유지되고 해당 행에서만 명시적으로 재시도한다.
- **권한/경계**: 기존 `WorkspaceSettingsShell` admin guard와 각 API의 권한 계약을 재사용한다. 비밀값은 읽거나 표시하지 않으며 GitHub/GitLab/Slack/Notion은 credential과 callback 검증이 없으므로 connect control이나 연결됨 상태를 만들지 않았다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 별도 설정 저장은 없다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, focused integrations/settings E2E **2 PASS**다. 첫 2-worker 전체 E2E는 기존 개인 메모 충돌 시나리오의 locator wait 1건만 30초 timeout이었고 동일 시나리오 단독 **1 PASS**로 격리했다. 최종 PR CI 동일 재시도 조건 전체 E2E는 **319 PASS + opt-in visual QA 1 skip**으로 통과했다. Clean-room frontend **161**/backend **45**, Python `pip-audit`와 web `npm audit` 모두 0 vulnerabilities, diff check도 PASS했다.
- **증적/이연**: `docs/screenshots/redevelopment/integrations-hub-ui/{desktop,mobile}.png`에 실제 상태, 관리 action과 responsive layout을 보존한다. 실 GitHub/GitLab/Slack/Notion adapter는 외부 운영 자격이 확보될 때까지 명시 이연한다.

---

# UI-164 Workspace Administration Overview 검증 (2026-07-19)

- **UI 변경**: Workspace Settings의 기본 진입점을 `/admin/overview`로 바꾸고 `개요` navigation을 추가했다. 한 compact surface에서 Identity, 사용자, 초대, 근무 일정, 프로젝트 단계와 선택 기능 상태를 훑고 각 기존 관리 화면으로 이동한다. Desktop은 상태와 action을 한 행에 유지하고 390px mobile은 action을 전체 폭으로 내려 가로 overflow를 방지한다.
- **기능/API 반영**: 여섯 행은 기존 Workspace profile, 사용자 directory, workspace invitation, working calendar, project phase definition, capability React Query를 독립 호출한다. 실제 활성 사용자·관리자·초대·근무일·단계·effective capability를 계산하고 AI policy가 deployment 상한으로 차단된 경우를 구분한다. 한 query 실패는 해당 행에서만 표시·재시도하며 `모두 새로고침`은 여섯 query를 함께 갱신한다. 모든 manage control은 실제 설정 route로 연결된다.
- **권한/이연**: 기존 `WorkspaceSettingsShell` 관리자 guard와 각 API 권한 계약을 재사용한다. Custom role 편집과 외부 provider 설정은 별도 capability가 필요하므로 이번 surface에 미배선 control을 만들지 않았다. 신규 API, DB/schema, migration, permission registry, environment variable, dependency 또는 별도 설정 저장은 없다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, focused settings/overview/global navigation/user directory E2E **4 PASS**다. 최종 2-worker full E2E는 **319 PASS + opt-in visual QA 1 skip + workspace invitation 1 retry PASS**였고, retry 건은 단독 1-worker 재검증에서 **1 PASS (6.9s)**로 통과해 병렬 실행 지연으로 격리했다. Clean-room frontend **161**/backend **45**, npm/pip audit 0 vulnerabilities와 diff check도 PASS했다.
- **증적**: `docs/screenshots/redevelopment/settings-overview-ui/{desktop,mobile}.png`에 부분 실패 복구 후의 실제 상태와 responsive layout을 보존한다.

---

# UI-165 Login Exact-Origin Interaction Stage 검증 (2026-07-19)

- **UI 변경**: 데스크톱의 손대지 않은 기본 로그인 상태에 승인 원본 전체를 같은 4:3 좌표계로 렌더링한다. 이 레이어는 pointer event를 받지 않으며 첫 pointer, focus 또는 keyboard 상호작용과 같은 프레임에 투명해져 기존 기능형 인증 DOM을 노출한다. OIDC, config error, 초대, OAuth error, 한국어, 입력값 상태는 원본 레이어를 건너뛰고 실제 상태를 즉시 표시하며 `390x844` 모바일은 기존 단일 열 기능 화면만 사용한다.
- **픽셀 실사**: 실제 인앱 Chromium `1440x900`, DPR 2의 product panel `(152,24) 1136x852`를 승인 `1448x1086` 크기로 정규화했다. 전체 MAE는 `3.601 -> 1.983`, 좌측 `2.365 -> 2.355`, 인증 영역 `5.094 -> 1.535`, auth card `6.604 -> 1.747`, options/submit `11.157 -> 2.666`, providers `9.568 -> 2.225`로 감소했다.
- **기능 확인**: 초기 `data-reference-state=reference`와 stage opacity 1, 이메일 클릭 후 `interactive`/opacity 0 및 실제 focus, 로컬 password-optional 비활성 상태, 비활성 password 좌표 click 전환, keyboard 전환, desktop/mobile stage 분기와 `scrollWidth === clientWidth === 390`을 확인했다. Credential, OIDC, assistance, policy, locale, validation, focus, safe-next, loading/error, reduced-motion은 기존 DOM/API 계약을 유지한다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, focused login E2E **13 PASS**, 신규 exact-origin interaction E2E **1 PASS**, 최종 full E2E **321 PASS + opt-in visual QA 1 skip**다. Clean-room frontend **161**/backend **45**, npm/pip audit 0 vulnerabilities, 인앱 desktop rest/interactive와 `390x844` mobile 실제 캡처, diff check도 PASS했다. PR CI와 main integration은 머지 절차에서 확인 후 갱신한다.
- **증적**: `docs/screenshots/redevelopment/login-exact-origin-interaction-ui/`에 desktop rest/interactive, mobile, normalized runtime, side-by-side와 5x diff를 보존한다. API/DB/migration/permission/environment/dependency/settings-storage 변경과 이연 항목은 없다.

---

# UI-166A Workspace Custom Project Role Foundation 검증 (2026-07-18)

- **UI 변경**: 없음. 미배선 역할 화면이나 장식용 권한 control을 먼저 만들지 않고, 다음 Settings surface가 실제로 소비할 수 있는 영속·인가 계약을 선행 구현했다.
- **기능/API 반영**: migration `0112`는 workspace 전역 `project_roles`, append-only `project_role_events`, `project_members.custom_role_id`를 추가한다. 사용자 지정 역할은 기존 `member` 권한을 기준으로 상태·작업 타입·필드·사이클·모듈·자동화·인테이크 판정의 7개 capability만 추가 위임한다. 프로젝트/멤버 관리, 작업 이동, 공유 대시보드 기본값은 위임할 수 없다. 관리자 create/update/archive/restore와 pagination된 audit history, 인증 사용자용 active catalog/capability list, 멤버 배정, 역할별 effective permission report와 `require_permission` 평가기를 제공한다.
- **권한/무결성**: owner/member/viewer는 예약 이름이며 사용자 지정 역할은 `member`에만 결합된다. 이름은 대소문자 무시 workspace unique, 역할 수는 50개로 제한하고 optimistic revision, catalog/row lock, DB FK/CHECK를 적용했다. 보관된 역할은 새 배정을 막지만 기존 배정과 권한은 유지해 운영 중인 프로젝트 권한을 조용히 회수하지 않는다. 기존 마지막 owner advisory lock, non-member 404 existence hiding, viewer read-only와 archived-project 409 계약은 유지된다. 역할 정의 변경은 actor와 revision을 포함한 상태 snapshot event로 남는다.
- **검증**: 최종 focused 역할/멤버/권한 report **25 PASS**, 최종 migration `0112 -> 0111 -> 0112` PASS, 변경 중간 전체 API **834 PASS** 후 입력·감사 pagination 경계만 보강하고 focused를 재실행했다. API Ruff/format, OpenAPI 생성·드리프트, shared type check, web typecheck/lint/build, clean-room frontend **161**/backend **45**, Python/web audit 0 vulnerabilities와 diff check가 PASS했다. 새 worktree에 `node_modules`가 없어 첫 clean-room/typecheck가 fail-closed됐고 잠금파일 기반 `npm ci` 후 같은 검증이 PASS했다.
- **이연 항목**: 7개 capability의 실제 owner-only endpoint guard 전환은 `UI-166B`, Workspace Settings 역할 편집과 프로젝트 멤버 배정 UI/E2E는 `UI-166C`에서 이어서 구현한다. 이번 기반만으로 사용자에게 노출되는 dead control은 없다. 외부 directory/SCIM 동기화는 운영 자격 증명 의존 범위로 유지한다. 요청된 plan-validator는 프로젝트와 사용자 홈에 실행 스크립트가 존재하지 않아 실행할 수 없었으며, 검증을 축소하지 않고 permission-critical invariant와 실제 테스트를 기준으로 진행했다.

---

# UI-166B Custom Role Endpoint Authorization 검증 (2026-07-19)

- **UI 변경**: 없음. Workspace Settings 역할 control을 노출하기 전에 custom role이 실제 제품 동작을 바꾸는 권한 경로를 완결했다.
- **기능/API 반영**: status, project type, custom field, cycle, module, automation rule, intake triage의 모든 기존 관리 mutation을 각 `*.manage`/`intake.triage` capability의 공통 `require_permission` guard에 연결했다. 읽기 계약은 그대로 두되, `intake.triage` 보유자는 다른 제출자의 큐와 판정 이력을 볼 수 있어 ID를 추측해야만 판정할 수 있는 불완전한 역할이 되지 않는다. plain member는 계속 자신의 intake만 볼 수 있다.
- **권한 경계**: custom role은 매 테스트 단계 정확히 하나의 capability만 보유하며 해당 실제 route만 성공한다. capability 제거 403, archived project 409, 기존 owner success, plain member/viewer denial, non-member existence hiding과 기존 보관 읽기 계약을 유지한다. 프로젝트/멤버 관리, work move와 shared dashboard default는 이번 변경에 포함되지 않는다.
- **검증**: 변경 7개 도메인과 custom role 집중 회귀 **60 PASS**, permission report/authz/viewer **31 PASS**, 최종 full API **835 PASS**(기존 Alembic path separator 경고 1건), 전체 API Ruff/format **428 files**, OpenAPI 생성/드리프트와 diff check PASS다. API schema 형태, DB/migration, environment variable, dependency와 Settings storage 변경은 없으며, 변경된 endpoint 설명은 shared type 생성물에 동기화했다.
- **이연 항목**: UI-166C에서 Workspace Settings 역할 매트릭스/lifecycle과 기존 프로젝트 멤버 배정 UI를 이 실제 authorization 계약에 연결한다. 외부 directory/SCIM은 운영 자격 증명 의존 범위다.

---

# UI-166C1 Workspace Custom Role Settings 검증 (2026-07-19)

- **UI 변경**: Workspace Settings에 `/admin/project-roles` 경로와 `프로젝트 역할` 내비게이션을 추가했다. 역할 목록·배정 인원·이름/설명·7개 capability 매트릭스·보관 포함 전환·생성·수정·보관·복원·append-only 변경 이력을 한 surface에 통합했다. loading, 접근 거부, 전체 오류/재시도, 감사 로그 오류/재시도, empty, validation, pending, archived read-only, unsaved-change guard, desktop/mobile no-overflow를 포함한다.
- **기능/API 반영**: UI-166A/B의 실제 capability catalog, 관리자 역할 CRUD/lifecycle/audit API를 generated OpenAPI type으로 직접 사용한다. 모든 mutation은 역할 목록, active catalog, 프로젝트 멤버, effective permission, audit cache를 무효화하며 update/archive/restore에는 `expected_revision`을 보낸다. 412에서는 사용자의 편집을 유지한 채 최신 역할 revision을 다시 읽고 명시적으로 재저장한다. 역할 생성 상한은 보관 역할이 아닌 활성 역할 50개를 기준으로 한다.
- **권한/경계**: `WorkspaceSettingsShell`의 workspace-admin fail-closed guard를 재사용하며 403 직접 응답도 명시적으로 처리한다. owner/member/viewer 기본 경계는 읽기 전용 설명으로 고정하고 사용자 지정 역할은 member에게 추가되는 7개 capability만 편집한다. 보관 역할은 기존 배정·유효 권한을 유지하고 새 배정에서 제외된다는 서버 계약을 그대로 표시한다. mock/dead control, 별도 DB/schema, migration, environment variable, dependency 또는 Settings storage 변경은 없다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, focused 역할 lifecycle E2E **1 PASS**, 전용 포트 2-worker full E2E **322 PASS + opt-in visual QA 1 skip**다. Clean-room frontend **161**/backend **45**, npm/pip audit 0 vulnerabilities와 diff check도 PASS했다. 격리 worktree 첫 clean-room은 API `.venv` 부재로 backend scan을 skip해 fail-closed됐고 동일 잠금환경 `.venv` 연결 후 4단계 모두 PASS했다.
- **증적/이연**: Chromium 증적은 `docs/screenshots/redevelopment/custom-roles-settings-ui/{desktop,mobile}.png`에 보존한다. 프로젝트 멤버별 사용자 지정 역할 배정은 기존 member management surface와 결합해야 하므로 `UI-166C2` 후속 PR로 분리하며, 이번 역할 정의 surface 안에는 미배선 UI가 없다.

---

# UI-166C2 Project Member Custom Role Assignment 검증 (2026-07-19)

- **UI 변경**: Project Settings의 기존 멤버 추가 폼과 팀 디렉터리에 활성 커스텀 역할 선택기를 연결했다. 멤버 역할에서만 선택할 수 있고 소유자·뷰어 전환 시 커스텀 역할을 명시적으로 제거한다. 활성 catalog에서 사라진 기존 역할은 멤버 응답의 이름을 유지해 `보관됨`으로 표시하며 active 선택지에는 다시 노출하지 않는다. Catalog loading/error/retry, 기본 역할 fallback, mutation error, owner 편집, member/viewer 읽기 전용과 desktop/mobile no-overflow를 포함한다.
- **기능/API 반영**: generated OpenAPI의 member create/update/read, project-role catalog와 permission-report 계약을 직접 사용한다. POST/PATCH는 실제 `custom_role_id`를 보내고 성공 후 roster, permission report와 admin assigned-count cache를 무효화한다. 내 커스텀 역할이 있으면 서버가 계산한 `effective` 값을 고정 owner/member/viewer 열과 분리된 `내 실효 권한` 열·모바일 행으로 보여준다. API, DB/schema, migration, permission registry, environment variable, dependency 또는 Settings storage 변경은 없다.
- **권한/경계**: 기존 Project owner만 멤버십을 변경하며 마지막 owner guard와 archived-project 409는 서버 계약을 유지한다. 커스텀 역할은 built-in `member`에만 결합되고, catalog 장애 시 기본 owner/member/viewer 관리는 계속 가능하지만 커스텀 역할 변경은 fail-closed된다. 읽기 전용 사용자는 배정명과 실효 권한만 확인하며 관리 control은 받지 않는다. mock/dead control 또는 장식용 action은 없다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, 멤버 설정 focused E2E **6 PASS**, 신규 핵심 E2E **2 PASS**, 전용 포트 full E2E **324 PASS + opt-in visual QA 1 skip**다. Clean-room frontend **161**/backend **45**, npm/pip audit 0 vulnerabilities가 PASS했다. 격리 worktree 첫 clean-room은 API `.venv` 부재로 fail-closed됐고 동일 잠금환경 연결 후 4단계 모두 PASS했다.
- **증적/이연**: Chromium 증적은 `docs/screenshots/redevelopment/member-custom-role-ui/{desktop,mobile}.png`에 보존한다. 외부 directory/SCIM과 이메일 초대 전달은 운영 자격 증명 의존 범위로 유지하며, 내부 custom-role 정의·인가·배정 surface에는 남은 미배선 기능이 없다.

---

# UI-167 Login Interactive Pixel Closure 검증 (2026-07-19)

- **UI 변경**: 첫 화면을 덮던 전체 로그인 screenshot layer와 첫 입력 시의 화면 교체 상태를 제거했다. 좌측은 사용자가 승인한 OneFlow 원화에서 정확히 분리한 `792x1086` story asset을 사용하고, 우측 브랜드는 동일 원화의 `205x70` lockup crop을 사용한다. 인증 카드는 첫 페인트부터 실제 DOM이며 `1280x720`처럼 낮은 데스크톱에서도 원본 4:3 좌표계의 padding, heading, field, option, submit, divider, provider, create-account 간격을 container 비율로 축소한다.
- **기능/API 반영**: 이메일·비밀번호·remember me·password visibility·도움/계정 요청·OIDC 공급자·정책 dialog·언어·safe-next·loading/error/retry·keyboard focus는 기존 실제 auth API와 semantic control을 그대로 사용한다. 초기 상태와 상호작용 상태가 동일 DOM이므로 mock/dead control, 투명 hit area 또는 상호작용 뒤 다른 화면으로 바뀌는 동작이 없다. API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **픽셀 전수 실사**: 인앱 Chromium `1280x720`에서 product panel `(192,24) 896x672`를 승인 `1448x1086` 원본과 같은 크기로 정규화했다. 기능형 화면 전체 MAE는 `6.798 -> 3.398`, 좌측 story `2.293 -> 2.291`, 칸반 `2.040 -> 2.029`, 인증 영역 `12.234 -> 4.734`, auth card `17.470 -> 6.056`, fields `31.375 -> 6.054`, providers `13.030 -> 9.416`이다. 문구·브라우저 font raster 차이는 남지만 외곽·컨트롤 좌표와 submit gradient는 원본과 정렬됐다.
- **반응형/검증**: 8개 목표 viewport에서 4:3 desktop panel, story/auth split, card/footer containment와 가로 overflow 0을 확인했다. typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, focused login E2E **13 PASS**, npm audit high 0 vulnerabilities, clean-room frontend **161**/backend **45**가 PASS했다. 첫 4-worker login 묶음은 공유 Vite의 page load 지연 2건이 timeout됐고, 동일 13개를 1-worker로 재실행해 모두 통과했다. 전체 회귀는 PR CI에서 다시 검증한다.
- **증적/이연**: `docs/screenshots/redevelopment/login-interactive-pixel-closure-ui/`에 desktop/mobile 실제 캡처와 원본-기능형 runtime-5x diff를 보존한다. 인증 surface 안의 기능 이연은 없으며 외부 공급자 실제 연결은 배포별 자격 증명 구성 경계를 유지한다.

---

# UI-169 Login Functional Pixel Regression 검증 (2026-07-19)

- **UI 변경**: 승인 원본에서 정확히 분리한 기존 1x 로그인 logo lockup은 유지하고, 동일한 OneFlow 소유 2x 원화에서 같은 좌표를 잘라 만든 `410x140` lockup을 `srcset`에 연결했다. Chromium DPR 2에서 이 자산을 실제 선택하므로 CSS 배치와 비율을 바꾸지 않으면서 고밀도 화면의 브랜드 가장자리 선명도를 높인다.
- **픽셀 전수 실사**: 승인 원본 `1448x1086`과 실제 Chromium `1455x1259`의 중앙 product panel `(117.5,172) 1220x915`를 원본 좌표로 정규화했다. DPR 1 MAE는 전체 `2.696`, 좌측 story `1.599`, 인증 영역 `4.021`, 칸반 `1.894`, 인증 브랜드 `4.171`, fields `4.976`, providers `7.254`다. max-channel delta `<=12` 비율은 전체 `95.46%`, story `96.90%`, auth `93.73%`다. 좌측 story crop과 1x auth logo crop은 승인 원본 대비 각각 MAE `0`이다.
- **고밀도 검증**: 새 DPR 2 context에서 `HTMLImageElement.currentSrc`가 `oneflow-login-logo-lockup@2x.png`를 선택함을 확인했다. 물리 픽셀 기준 auth logo edge energy는 DPR 1 `3.907`에서 DPR 2 `4.279`로 `9.54%` 상승했으며 레이아웃 geometry는 유지됐다.
- **기능/API 반영**: 첫 페인트부터 이메일·비밀번호·remember me·password visibility·지원 요청·OIDC·정책 dialog·언어·safe-next·loading/error/retry를 실제 semantic control과 기존 auth API로 제공한다. 전체 화면 overlay, 투명 hit layer, mock 또는 dead control은 없다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings UI 변경은 없다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, focused login E2E **14 PASS**, 전용 포트 2-worker full E2E **325 PASS + opt-in visual QA 1 skip**다. Clean-room frontend **161**/backend **45**, npm/pip audit 0 vulnerabilities와 diff check도 PASS했다. 새 worktree의 첫 clean-room은 API `.venv` 부재로 backend scan이 fail-closed됐고 동일 잠금환경 `.venv`를 연결한 재검사에서 4단계가 모두 통과했다.
- **증적/이연**: `docs/screenshots/redevelopment/login-functional-pixel-regression-ui/`에 DPR 1/2 desktop, `390x844` mobile, 정규화 runtime, side-by-side와 5x diff를 보존한다. 외부 공급자 인증은 배포별 자격 증명 설정 경계를 유지하며 이번 surface의 구현 이연은 없다.

---

# UI-170 Shared Action Menu Keyboard Lifecycle 검증 (2026-07-19)

- **UI 변경**: 상태·작업 타입·자동화 설정이 공유하는 inline action menu가 열릴 때 첫 사용 가능 항목으로 포커스를 이동한다. 비활성 항목을 건너뛰는 `ArrowUp`/`ArrowDown` 순환, `Home`/`End`, 명시적인 focus ring, `Escape` 닫기와 trigger focus 복귀, `Tab` 이탈, 외부 pointer 닫기를 공통 적용했다.
- **기능/API 반영**: 기존 편집·순서 이동·활성화·삭제 mutation을 그대로 유지하며 메뉴 선택 후 각 실제 dialog/action으로 진입한다. `aria-controls`, `aria-expanded`, `menu`/`menuitem` 관계와 열린 메뉴 ID를 연결했다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **이연 항목**: Cycle, Module, Timeline, Backlog 등 별도 floating action menu는 서로 다른 anchor/portal 수명주기를 사용하므로 다음 UI surface에서 같은 acceptance contract로 통합한다. 이번 shared inline menu 안에는 mock/dead control 또는 미배선 동작이 없다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, focused status menu E2E **1 PASS**, 관련 설정 메뉴 E2E **2 PASS**, 전용 포트 2-worker full E2E **325 PASS + opt-in visual QA 1 skip**다. 실제 Chromium에서 첫 항목 진입, 비활성 항목 건너뛰기, 양방향 순환, `Home`/`End`, 외부 클릭, `Escape` focus 복귀와 뒤이은 실제 rename/reorder 요청을 검증했다. Clean-room frontend **161**/backend **45**, npm/pip audit 0 vulnerabilities와 diff check도 PASS했다.

---

# UI-171 Milestone Action Menu Convergence 검증 (2026-07-19)

- **UI 변경**: 마일스톤 행의 중복 action menu를 공통 `InlineActionMenu`로 교체했다. 열기 즉시 첫 사용 가능 항목 진입, 방향키·`Home`/`End`, 외부 클릭, `Escape` trigger 복귀와 동일한 focus ring을 Settings의 다른 action menu와 공유한다.
- **기능/API 반영**: 작업 목록은 실제 `milestone_id` 필터 route로 이동하고 owner 편집·삭제는 기존 PATCH/DELETE 및 파괴 확인을 유지한다. Viewer는 작업 목록 이동과 비활성 `쓰기 권한 없음` cue만 받으며 방향키 탐색은 비활성 항목을 건너뛴다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **이연 항목**: Cycle, Module, Timeline, Backlog처럼 viewport 좌표에 고정되는 floating menu는 trigger anchor와 portal 수명주기를 포함해 별도 후속 surface에서 통합한다. 이번 마일스톤 surface에는 mock/dead control 또는 미배선 동작이 없다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, focused owner/viewer milestone E2E **2 PASS**, clean-room frontend **161**/backend **45**, npm/pip audit 0 vulnerabilities와 diff check가 PASS했다. 2-worker full E2E 첫 실행은 변경 영역을 포함해 **324 PASS + opt-in visual QA 1 skip**였고, 무관한 Workspace 초대 1건이 누적 부하에서 30초 대기 timeout을 1회 기록했다. 해당 시나리오 단독 재실행은 **repeat 5/5 PASS**(각 약 2.5초)로 재현되지 않았으며 PR CI `29696864679`와 main integration `29697190636`의 독립 full E2E에서는 재발 없이 4잡이 모두 통과했다.

---

# UI-172 Cycle Action Menu Lifecycle 검증 (2026-07-19)

- **UI 변경**: viewport-fixed Cycle 행 메뉴가 열리면 첫 enabled action으로 포커스하고 `ArrowUp`/`ArrowDown`·`Home`/`End`로 비활성 항목을 건너뛰며 순환한다. `Escape`와 명시 닫기는 trigger 포커스를 복원하고 outside pointer는 자연스럽게 메뉴만 닫는다. Trigger의 `aria-haspopup`·`aria-expanded`·`aria-controls`를 실제 메뉴 ID와 연결한다.
- **기능/API 반영**: 기존 작업 목록 필터 이동, 번다운 표시, owner 편집·완료 사이클 이월·삭제와 viewer read-only cue를 유지한다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **이연 항목**: Module, Timeline, Backlog의 viewport-fixed menu는 각 anchor와 고유 action을 다음 UI surface에서 같은 계약으로 수렴한다. 이번 Cycle surface에는 mock/dead control 또는 미배선 동작이 없다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, 완료 사이클 이월을 포함한 focused Cycle E2E **3 PASS**, 전용 포트 2-worker full E2E **325 PASS + opt-in visual QA 1 skip**다. 실제 Chromium에서 첫 항목 진입, 비활성 cue 건너뛰기, `ArrowUp`/`ArrowDown` 양방향 순환, `Home`/`End`, 외부 클릭, `Escape` trigger focus 복귀와 실제 번다운·이월 동작을 확인했다. Clean-room frontend **161**/backend **45**, npm/pip audit 0 vulnerabilities와 diff check도 PASS했다.

---

# UI-173 Module Action Menu Lifecycle 검증 (2026-07-19)

- **UI 변경**: viewport-fixed Module 행 메뉴와 Cycle 행 메뉴가 공통 `useFloatingActionMenuLifecycle`을 사용한다. 열기 즉시 첫 enabled action으로 진입하고, 비활성 cue를 건너뛰는 `ArrowUp`/`ArrowDown` 순환, `Home`/`End`, `Tab` 자연 이탈, outside pointer 종료, `Escape`·명시 닫기의 trigger 복귀를 같은 구현으로 제공한다. Trigger의 `aria-haspopup`·`aria-expanded`·`aria-controls`도 실제 메뉴 ID와 연결했다.
- **기능/API 반영**: Module의 실제 작업 목록 필터 이동, 참여자 패널과 PUT 저장, owner 편집·삭제 및 viewer read-only cue를 유지했다. UI-172 Cycle의 작업 목록·번다운·편집·이월·삭제 회귀도 공통 훅 전환 뒤 함께 확인했다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **이연 항목**: Timeline과 Backlog 등 서로 다른 item action menu는 현재 고유 기능을 유지하며 후속 UI surface에서 공통 lifecycle 적용 가능성을 검토한다. 이번 Module/Cycle 공통 surface에는 mock/dead control 또는 미배선 동작이 없다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, Module 실제 참여자/편집과 owner/viewer 및 Cycle 이월 회귀를 포함한 focused E2E **7 PASS**, 전용 포트 2-worker full E2E **325 PASS + opt-in visual QA 1 skip**다. Clean-room frontend **161**/backend **45**, npm/pip audit 0 vulnerabilities와 diff check도 PASS했다.

---

# UI-174 Planning Work Item Action Menu Convergence 검증 (2026-07-19)

- **UI 변경**: Backlog와 Timeline의 viewport-fixed 작업 항목 메뉴가 공통 `useFloatingActionMenuLifecycle`을 사용한다. 열기 즉시 첫 enabled action에 진입하고 `ArrowUp`/`ArrowDown`·`Home`/`End` 순환, 비활성 viewer cue 건너뛰기, `Tab` 자연 이탈, outside pointer 종료, `Escape`·명시 닫기의 trigger 복귀를 제공한다. Backlog React trigger와 DHTMLX가 생성한 Timeline trigger 모두 `aria-haspopup`·`aria-expanded`·`aria-controls`를 실제 메뉴 ID와 동기화한다.
- **기능/API 반영**: 두 surface의 실제 상세 drawer, 전체 페이지 이동, 링크 복사, 복제 POST, 이동 panel과 owner/viewer 권한 경계를 그대로 유지했다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **이연 항목**: 없음. 이번 두 planning layout의 메뉴 안에는 mock/dead control 또는 미배선 동작이 없다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, owner/viewer·desktop/mobile 실제 기능을 포함한 focused Backlog/Timeline E2E **6 PASS**, 전용 포트 2-worker full E2E **325 PASS + opt-in visual QA 1 skip**다. Clean-room frontend **161**/backend **45**, npm/pip audit 0 vulnerabilities, mobile screenshot containment와 diff check도 PASS했다. PR `#364`를 squash merge한 뒤 main integration CI `29700968144`에서도 frontend, backend, security-audit, cleanroom 4개 job이 모두 PASS했다.

---

# UI-175 Work Item Dropdown Action Convergence 검증 (2026-07-19)

- **UI 변경**: Board 카드, List 행, Tree 항목, Calendar 항목의 중복 dropdown content를 공통 `WorkItemDropdownActionMenuContent`로 통합했다. 각 trigger와 menu는 작업 제목·surface를 포함한 접근성 이름을 유지하고, 열기 즉시 첫 실제 action에 진입하며 비활성 viewer cue를 건너뛰는 방향키 순환, `Escape` 종료와 trigger focus 복귀, 모바일 viewport containment를 공통 제공한다.
- **기능/API 반영**: 네 surface 모두 실제 상세 drawer, 전체 페이지 이동, 링크 복사, 복제 POST, 이동 panel을 연결한다. 비동기 복제 결과는 dropdown이 닫혀 content가 unmount된 뒤에도 성공·오류 메시지를 전달하며, viewer는 읽기 action과 비활성 `읽기 전용` cue만 받는다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **이연 항목**: 없음. 이번 네 surface의 menu 안에는 mock/dead control 또는 미배선 동작이 없다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, owner/viewer·desktop/mobile 실제 기능과 keyboard lifecycle을 포함한 focused E2E **12 PASS**다. 2-worker full E2E는 변경 영역과 그 외 **324 PASS + opt-in visual QA 1 skip** 뒤 무관한 개인 메모 충돌 시나리오가 누적 부하에서 30초 timeout을 1회 기록했고, 해당 시나리오 단독 `repeat-each=5`는 **5/5 PASS**(각 약 1.9초)로 재현되지 않았다. 네 mobile screenshot을 실제 Chromium에서 검토해 menu가 viewport를 벗어나거나 주변 UI를 재배치하지 않음을 확인했다. Clean-room frontend **161**/backend **45**, npm/pip audit 0 vulnerabilities와 diff check도 PASS했다. PR CI 결과는 이어지는 검증에서 기록한다.

---

# UI-176 Project Sidebar Action Menu Lifecycle 검증 (2026-07-19)

- **UI 변경**: 프로젝트 sidebar의 ellipsis dropdown에 transform-origin 기반 열림/닫힘 motion을 공통 적용하고, `aria-controls`·`aria-expanded`를 실제 menu ID와 연결했다. 열기 즉시 첫 enabled action에 진입하며 `ArrowUp`/`ArrowDown`, `Home`/`End`, `Escape` trigger focus 복귀와 닫힘 애니메이션 중 상태를 검증했다. `prefers-reduced-motion`에서는 전환을 제거한다.
- **기능/API 반영**: 기존 개인별 즐겨찾기 설정, clipboard 링크 복사, 프로젝트 설정 이동, owner 멤버 확인과 보관 mutation을 그대로 유지했다. viewer/member 권한 경계를 우회하거나 장식용·미배선 action을 추가하지 않았다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **이연 항목**: 없음. 이번 프로젝트 sidebar menu의 모든 노출 action은 기존 실제 상태·navigation·API에 연결돼 있다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, keyboard·desktop/mobile·실제 즐겨찾기/복사/설정/보관 focused E2E PASS, 전용 포트 2-worker full E2E **325 PASS + opt-in visual QA 1 skip**다. 닫힘 motion 뒤 알림 검증은 menu text가 아니라 실제 `status` live region으로 고정하고 Tree/Timeline/프로젝트 메뉴 focused 재검증도 통과했다. Clean-room frontend **162**/backend **45**, pip/npm audit 0 vulnerabilities와 diff check가 PASS했다. 격리 worktree의 첫 clean-room은 API `.venv` 부재로 fail-closed됐고 동일 잠금환경 연결 후 4단계 모두 재검사 PASS했다.
- **증적**: `docs/screenshots/redevelopment/projects-sidebar-actions-ui/{project-menu,mobile-project-menu}.png`을 실제 Chromium에서 확인해 desktop anchor, mobile drawer containment, focus state와 주변 layout 비재배치를 검증했다.

---

# UI-177 Navigation Overlay Bidirectional Motion 검증 (2026-07-20)

- **UI 변경**: Workspace `More` 패널과 `내비게이션 사용자 지정` dialog가 `opening`/`open`/`closing`/`closed` 단계로 유지된다. 열림은 anchor에서 자연스럽게 확장되고 닫힘은 같은 축으로 축소되며, backdrop도 surface와 동시에 사라진다. 닫힘 완료 전에는 DOM을 유지해 애니메이션이 끊기지 않고 pointer interaction은 차단한다. `prefers-reduced-motion`에서는 중간 단계를 즉시 정착한다.
- **기능/API 반영**: More의 실제 route 이동·pin/unpin, Customize의 표시 여부·순서·drag, 프로젝트 탐색 방식과 sidebar 프로젝트 수 제한 저장을 그대로 유지했다. `Escape`, outside pointer, 모바일 닫기, focus trap과 종료 후 trigger focus 복귀를 전환 단계와 함께 검증했다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **이연 항목**: 없음. 두 overlay의 노출 control은 모두 기존 실제 navigation 또는 개인 preference 저장에 연결돼 있으며 mock/dead control을 추가하지 않았다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **107 PASS**, component **8 PASS**, desktop/mobile·focus·persistence·reduced-motion focused E2E PASS다. 첫 4-worker full E2E는 누적 부하에서 기존 장기 시나리오 5건이 30초 timeout되고 뒤이어 dev server channel이 종료됐다. 해당 5건 중 4건은 1-worker 재실행에서 PASS했고, 빠른 링크 1건은 닫힘 motion 중 남은 이전 Radix menu와 열린 menu를 함께 찾던 test locator를 `data-state="open"`으로 제한한 뒤 PASS했다. 이후 전용 포트 2-worker full E2E가 **325 PASS + opt-in visual QA 1 skip**로 완주했다. Clean-room frontend **162**/backend **45**, npm/pip audit 0 vulnerabilities도 PASS했다.
- **증적**: `docs/screenshots/redevelopment/navigation-overlay-motion-ui/{more-desktop,more-mobile}.png`과 `docs/screenshots/redevelopment/sidebar-resize-customize-ui/{desktop-customize,mobile-customize}.png`을 실제 Chromium에서 확인해 desktop anchor, mobile viewport containment, 완전 개방 상태와 주변 layout 비재배치를 검증했다.

---

# UI-178 Shared Sheet Bidirectional Motion 검증 (2026-07-20)

- **UI 변경**: 작업 상세, 이니셔티브 상세, 알림, CSV 가져오기와 템플릿 상세가 공유하는 우측 Sheet의 overlay와 panel을 닫힘 애니메이션이 끝날 때까지 유지한다. 열림·닫힘 fade/slide, focus trap, `Escape`/outside/close-button 종료와 trigger 복귀, reduced-motion과 mobile containment를 하나의 공통 수명주기로 제공한다.
- **기능/API 반영**: 다섯 consumer의 실제 상세 조회·수정, 알림 인박스 이동, CSV 가져오기와 템플릿 동작을 유지했다. 열린 상태 transform을 해제해 중첩 fixed picker가 viewport 기준에서 벗어나지 않게 했다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **이연 항목**: 없음. 노출 control은 모두 기존 실제 navigation, query 또는 mutation에 연결돼 있다.
- **검증**: typecheck, lint, production build, unit **107 PASS**, component **8 PASS**, focused regressions, full E2E **326 PASS + opt-in visual QA 1 skip**, clean-room frontend **162**/backend **45**, npm/pip audit 0 vulnerabilities가 PASS했다. PR #374/squash `cbb0a1b`, PR/main Actions `29718249125`/`29718696104`도 PASS했다.

---

# UI-179 Workspace Views Shared Modal Motion 검증 (2026-07-20)

- **UI 변경**: Saved view, 열 순서와 Analytics dialog가 공통 overlay/content primitive를 사용해 짧은 fade/scale 열림과 닫힘, trigger focus 복귀, `Escape`/button 종료, reduced-motion과 mobile containment를 동일하게 제공한다.
- **기능/API 반영**: 실제 saved-view 생성·수정·삭제, column order URL/private-view 왕복과 filtered Analytics 요청·loading/error/empty 상태를 그대로 유지했다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **이연 항목**: 없음. 세 modal의 control은 기존 실제 query, mutation 또는 URL state에 연결돼 있다.
- **검증**: typecheck, lint, production build, unit **107 PASS**, component **8 PASS**, focused E2E **5 PASS**, full E2E, clean-room frontend **162**/backend **45**, npm/pip audit 0 vulnerabilities가 PASS했다. PR #375/squash `7c1e84e`, PR/main Actions `29719629199`/`29720085654`도 PASS했다.

---

# UI-180 Login In-App Exhaustive Pixel Audit 검증 (2026-07-20)

- **UI 변경**: 승인 원본과 현재 로그인 화면을 Codex 인앱 Chromium에서 다시 실사했다. runtime 전체 원본의 SHA-256은 승인 원본과 동일하고, story와 auth logo source crop은 각각 pixel MAE `0`이다. 강제 2x 선택, `-webkit-optimize-contrast`, animation transform 해제는 같은 세션 A/B에서 오차를 키워 적용하지 않았다.
- **기능/API 반영**: 첫 페인트부터 이메일, 비밀번호, remember me, password visibility, 지원 요청, OIDC, 정책 dialog, 언어, safe-next, loading/error/retry를 실제 semantic control과 기존 auth API로 제공한다. 승인 전체 화면 overlay, 투명 hit layer, mock 또는 dead control은 없다. 전체·story·logo 1x/2x 자산의 SHA-256을 고정하는 unit regression을 추가했다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **픽셀 전수 실사**: 인앱 Chromium DPR 1, viewport `1455x1259`, product panel `(117.5,172) 1220x915`를 승인 `1448x1086` 좌표로 정규화했다. MAE/최대 채널 delta `<=12` 비율은 전체 `4.088/90.67%`, story `4.034/89.69%`, top decoration `1.967/97.36%`, story brand `4.102/85.87%`, headline `5.742/75.72%`, Kanban `3.115/94.70%`, river/terrain `5.392/84.26%`, activity cards `5.617/80.28%`, foreground `4.064/90.70%`, auth `4.153/91.84%`, auth card `5.181/88.37%`, auth brand `7.230/86.17%`, fields `4.527/91.33%`, providers `8.345/87.27%`다. 인앱 screenshot transport가 JPEG bytes를 반환하므로 같은 서버·viewport의 Chromium PNG도 함께 보존했다. 잔여치는 compact downsampling, 인앱 capture codec, 브라우저 color management, semantic DOM font rasterization과 움직이는 협업 경로 highlight에서 발생한다.
- **반응형/검증**: mobile `390x844`에서 canvas `scrollWidth === clientWidth === 375`로 가로 넘침이 없다. typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **108 PASS**, component **8 PASS**, focused login E2E **8 PASS**, clean-room frontend **162**/backend **45**, npm/pip audit 0 vulnerabilities가 PASS했다.
- **증적/이연**: `docs/screenshots/redevelopment/login-in-app-exhaustive-audit-ui/`에 desktop/mobile, normalized runtime, side-by-side와 5x diff를 보존한다. 외부 OIDC 공급자의 실제 연결은 배포별 credential 경계를 유지하며 이번 surface의 기능 이연은 없다.

---

# UI-181 Project Functional Modal Motion 검증 (2026-07-20)

- **UI 변경**: 프로젝트 표지, 일정 기준선 생성과 삭제 확인을 공통 `ModalOverlay`/`ModalContent`로 수렴해 열림·닫힘 fade/scale, focus trap, trigger focus 복귀와 mobile containment를 같은 계약으로 제공한다. 시각 QA에서 Tailwind 4의 독립 `translate` 속성과 keyframe `transform`이 중앙 이동을 중복 적용하던 결함을 발견해, modal 좌표를 CSS transform 한 곳에서만 소유하도록 교정했다.
- **기능/API 반영**: 실제 표지 이미지 upload·project PATCH·remove와 실패 attachment cleanup, 기준선 POST·DELETE, stale version 409 재조회·재시도를 유지했다. Busy 상태의 dismissal 차단, 닫기 버튼과 종료 후 정확한 trigger 복귀도 실제 request 흐름 안에서 검증했다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **이연 항목**: 없음. 세 대화상자의 모든 control은 실제 query, mutation 또는 파일 선택에 연결돼 있으며 mock/dead control을 추가하지 않았다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **108 PASS**, component **8 PASS**, centered geometry·close presence·focus·actual mutation을 포함한 focused E2E **2 PASS**, 공통 Saved view/Column order/Analytics modal까지 포함한 2-worker full E2E **327 PASS + opt-in visual QA 1 skip**다. Clean-room frontend **162**/backend **45**, npm/pip audit 0 vulnerabilities도 PASS했다.
- **증적**: `docs/screenshots/redevelopment/project-modal-motion-ui/{cover-desktop,baseline-create-desktop,baseline-delete-mobile}.png`을 실제 Chromium에서 확인해 완전 개방 상태의 중앙 정렬, desktop spacing, 390px mobile no-overflow와 주변 layout 비재배치를 검증했다.

---

# UI-182 Login Integer Pixel Convergence 검증 (2026-07-20)

- **UI 변경**: 인앱 Chromium `1455x1259` 실사에서 product panel 시작점 `117.5px`, story 폭 `667.28125px`, auth logo `172.703125x58.96875`가 승인 원본 전체에 서브픽셀 축소 보간을 발생시키는 것을 확인했다. 큰 데스크톱에서 panel origin을 CSS `round()`로 정수 격자에 맞추고, story `667x915`와 auth logo `173x59`의 승인 원본 Lanczos 파생 자산을 실제 `srcset` 후보로 선택한다. 낮은 높이·tablet·mobile·DPR 2의 기존 반응형 후보는 유지한다.
- **기능/API 반영**: 이메일, 비밀번호, remember me, password visibility, 도움/접근 요청, OIDC, 언어, safe-next와 실제 auth API 배선은 변경하지 않았다. 인증 surface를 승인 전체 이미지나 투명 hit layer로 교체하지 않았고 모든 control은 semantic DOM과 실제 상태를 유지한다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **픽셀 전수 재실사**: 동일 기준 좌표에서 full MAE `4.088 -> 2.632`, story `4.034 -> 1.791`, Kanban `3.019 -> 1.902`, river/terrain `5.304 -> 1.658`, activity `5.615 -> 2.198`, foreground `3.838 -> 1.408`, auth `4.153 -> 3.649`, auth brand `5.743 -> 2.822`로 감소했다. full/story의 최대 채널 delta `<=12` 비율은 각각 `90.67% -> 95.34%`, `89.69% -> 96.38%`다. desktop geometry는 panel `(118,172) 1220x915`, story `(118,172) 667x915`, logo `173x59`로 정착한다.
- **검증**: 승인 전체/story/logo 및 신규 정수 크기 파생 자산 SHA-256 unit regression을 포함한 unit **108 PASS**, component **8 PASS**, typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 large chunk warning), focused visual/geometry E2E PASS, 전체 E2E **328 PASS / 1 visual manifest SKIP**, `390x844` no-overflow와 desktop/mobile lossless screenshot 시각 검토가 PASS했다. 첫 전체 E2E의 Quick Dock 300ms timing assertion 1건은 병렬 CPU stall 뒤 완료 phase를 읽은 비제품 플래키로 단독 반복 **3 PASS**했고, 동일 전체 E2E 재실행에서 해당 항목을 포함해 **328 PASS / 1 SKIP**으로 완주했다. clean-room inventory는 frontend 162/backend 45 packages PASS, `npm audit`과 `pip-audit`는 모두 취약점 0건이다.
- **증적**: `docs/screenshots/redevelopment/login-integer-pixel-ui/`에 desktop/mobile, normalized runtime, side-by-side와 5x diff를 보존한다.

---

# UI-186 Login Pixel Reinspection Closure 검증 (2026-07-20)

- **UI 변경**: 승인 원본을 포함한 story가 정수 좌표에 도달한 뒤에도 page-level `translate` 합성 때문에 GPU에서 다시 보간되던 원인을 제거했다. 큰 데스크톱 panel을 직접 정수 margin에 배치하고 story에 이미 포함된 외곽선을 중복 렌더링하지 않도록 auth 면에만 외곽선을 남겼다. auth logo는 173px 사전 축소본 대신 승인 205px crop을 DPR 1 source로 선택해 로고 획과 글자 선명도를 보존했고 card, input, CTA의 border·shadow·색을 원본 기준으로 미세 조정했다.
- **기능/API 반영**: 이메일 입력, remember me, 비밀번호 표시, 지원·정책 dialog, Google/Microsoft/SSO availability, 언어, safe-next와 실제 auth API 계약을 그대로 유지했다. 인앱 Chromium에서 이메일 입력, remember toggle, 미설정 Google 안내 dialog의 열기·닫기와 가로 overflow 0을 다시 확인했다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings UI 변경은 없다.
- **픽셀 전수 재실사**: `1448x1086` 현재 화면의 panel `(114,86)-(1334,1001)`을 승인 원본과 `1220x915`로 정규화했다. 이전 UI-182 기준 대비 full MAE는 `2.799 -> 1.820`, story는 `1.799 -> 0.506`으로 감소했다. 최종 story brand와 Kanban MAE는 각각 `0.663`, `1.032`이며 edge ratio는 story `1.0012`, brand `0.9994`, Kanban `1.0003`으로 원본 선명도를 유지한다. auth MAE는 `3.404`이며 semantic DOM과 브라우저 font rasterization 차이를 포함한다.
- **이연 항목**: 외부 OIDC 공급자의 실제 연결은 배포 credential 경계를 유지한다. 이외 이번 로그인 surface의 mock/dead control 또는 미배선 UI는 없다.
- **검증**: focused login E2E **15 PASS**, typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), unit **108 PASS**, component **8 PASS**, production build PASS(기존 large chunk warning), clean-room frontend **161**/backend **45**, npm audit high 0, diff check PASS다. 2-worker full E2E는 **329 PASS + visual manifest 1 skip** 뒤 무관한 DHTMLX Timeline 강제 클릭 1건이 병렬 부하에서 5초 URL 전환을 놓쳤고, 동일 시나리오 단독 반복은 **5/5 PASS**로 재현되지 않았다.
- **증적**: `docs/screenshots/redevelopment/login-pixel-reinspection-ui/`에 reference-size capture, normalized side-by-side, 8x diff heatmap, pixel metrics JSON, desktop와 mobile lossless screenshot을 보존한다.

---

# UI-185 Work Item Properties Rail IA 검증 (2026-07-21)

- **UI 변경**: full-page와 drawer가 공유하는 작업 속성 영역을 하나의 form-like stack에서 `상세`, `일정`, `프로젝트 구조`, `기록`의 compact label/value hierarchy로 재구성했다. 데스크톱은 별도 card를 중첩하지 않는 sticky right rail, 모바일은 같은 정보 순서를 유지하는 단일 열 surface를 사용한다. 행 hover/focus, 아이콘, section divider와 밀도는 OneFlow token과 Lucide icon으로 구현했다.
- **기능/API 반영**: 상태, 우선순위, 담당자, 타입, 시작일/기한, 예상 시간, 사이클, 모듈, 마일스톤과 고객의 기존 CAS PATCH 경로를 그대로 재사용한다. 날짜 역전 검증과 두 날짜 동시 repair, viewer read-only, roster loading/error, 전체 속성 collapse, persisted panel/label-column resize, 저장 오류와 header control 동기화를 보존했다. 기록 영역은 기존 work-package 응답의 생성자, 업데이트 시각과 version만 읽어 표시한다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings UI 변경은 없다.
- **이연 항목**: 없음. 이번 rail에 추가된 control이나 값은 모두 기존 query/mutation 또는 authoritative 응답에 연결돼 있다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 large chunk warning), unit **108 PASS**, component **8 PASS**, focused property/resize/mobile E2E **3 PASS**와 최종 전용 capture E2E **2 PASS**, clean-room frontend **162**/backend **45**, npm audit high 0, diff check PASS다. Full E2E는 **331 PASS + visual manifest 1 skip**이며 Sidebar focus 1건이 4-worker 부하에서 timeout 후 단독 반복 **5/5 PASS**로 재현되지 않았다.
- **증적**: `docs/screenshots/redevelopment/detail-properties-ui/{desktop,mobile}.png`에 실제 Chromium 전체 화면을 보존했다.

---

# UI-187 Work Item Linked Content Sections 검증 (2026-07-21)

- **UI 변경**: 작업 상세 본문의 Relations 대형 metric/card dashboard와 서로 다른 Pages/Attachments card 표현을 compact section header, count, divided row의 하나의 linked-content hierarchy로 재구성했다. 관계 추가 form은 항상 노출하지 않고 header의 icon command로 열며, mobile에서는 동일 순서의 single-column composer로 전환한다.
- **기능/API 반영**: 기존 relation create/delete mutation, relation candidate query, document detail navigation, stored attachment download와 external attachment open을 그대로 유지한다. 세 section의 loading/empty/error를 같은 정보 계층으로 정리하고, 오류 행의 `다시 시도`는 각각 실제 query `refetch()`에 연결했다. writer만 relation composer/delete를 보며 viewer 경계는 유지한다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings UI 변경은 없다.
- **이연 항목**: Time/Cost와 Custom fields의 본문 hierarchy는 이 PR에 섞지 않고 독립 후속 UI surface로 추적한다. 이번 Relations/Pages/Attachments에는 mock/dead control이나 기능 이연이 없다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 large chunk warning), unit **108 PASS**, component **8 PASS**, focused relation/mobile/desktop **3 PASS**, 세 query error recovery **1 PASS**, final desktop/mobile capture **2 PASS**, clean-room frontend **162**/backend **45**, npm audit 취약점 0, diff check PASS다. Full E2E는 변경 대상 3개를 포함해 **333 PASS + visual manifest 1 skip**이며, 무관한 Project schedule baseline overflow 안정화 1건이 4-worker 부하에서 timeout 후 단독 반복 **5/5 PASS**로 재현되지 않았다.
- **증적**: `docs/screenshots/redevelopment/detail-linked-content-ui/{desktop,mobile,mobile-composer}.png`에 실제 Chromium 화면을 보존했다.

---

# UI-188 Work Item Time/Cost Ledger IA 검증 (2026-07-21)

- **UI 변경**: 작업 상세의 시간 추적과 비용을 중첩 카드·상시 노출 form에서 compact section header, 요약, 얇은 progress bar와 scan-first ledger row로 재구성했다. 작성자는 `+` action으로 필요한 순간에만 composer를 열고 `X`로 닫으며, 모바일과 데스크톱이 같은 정보 계층을 사용한다.
- **기능/API 반영**: 시간 기록과 비용 등록은 각각 실제 POST를 보내고 성공 시 목록·합계를 갱신한 뒤 composer를 닫는다. 각 ledger row의 삭제는 실제 DELETE를 유지하며, 초기 조회 실패는 시간·비용별 `다시 시도`가 해당 query의 `refetch`를 실행한다. 예상·소요·잔여 시간, 비용 합계와 카테고리 표시는 서버 응답에서 계산한다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **권한/이연 항목**: Writer만 등록·삭제 control을 받고 viewer는 기존 값을 compact row로 읽는다. 로딩·오류·빈 상태를 section 안에서 독립 처리하며 mock/dead control 또는 장식용 action은 없다. Custom field 상세 계층은 UI-189 별도 surface로 이연한다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 chunk-size warning), unit **108 PASS**, component **8 PASS**, 신규 기능·오류 복구와 viewer 경계를 포함한 focused E2E **4 PASS**, 전용 포트 full E2E **336 PASS + opt-in visual QA 1 skip**다. Clean-room frontend **162**/backend **45**, npm audit 0 vulnerabilities와 diff check가 PASS했다. 기존 `5173` 로그인 서버 재사용으로 첫 focused 실행 3건이 이전 bundle을 읽어 실패했으며, UI-188 전용 `5190` 포트로 격리해 동일 검증과 전체 회귀를 재실행해 모두 통과했다.
- **증적**: `docs/screenshots/redevelopment/detail-ledgers-ui/{desktop,mobile-time,mobile-time-composer,mobile-cost}.png`을 실제 Chromium에서 확인해 desktop rail 옆 계층, mobile containment, composer 전환과 주변 layout 비재배치를 검증했다.

---

# UI-189 Work Item Custom Field Properties IA 검증 (2026-07-21)

- **UI 변경**: 작업 상세의 커스텀 필드를 중첩 metric/card 구조에서 compact section header와 type-aware label/value row로 재구성했다. 텍스트, 숫자, URL, 예/아니오, 날짜, 드롭다운, 멤버 입력은 같은 정보 계층을 공유하며, 비활성 필드와 삭제된 드롭다운 선택값도 보존값임을 표시한 채 읽고 정리할 수 있다.
- **기능/API 반영**: 기존 정의·값 query와 delta PUT을 그대로 사용한다. 숫자 유한값 검증, 멤버 roster 지연 조회·독립 오류 복구, 제거된 멤버 표시명 보존, writer 편집과 viewer 읽기 전용 경계를 유지했다. 정의 조회와 값 조회는 각 오류 행의 `다시 시도`가 해당 query만 다시 요청한다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **이연 항목**: 없음. 이번 custom-field surface의 모든 control은 실제 query 또는 mutation에 연결돼 있으며 mock/dead control이나 장식용 action은 없다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 large chunk warning), unit **108 PASS**, component **8 PASS**, 저장·desktop/mobile hierarchy·독립 오류 복구·viewer 경계를 포함한 focused E2E **5 PASS**다. 첫 4-worker full E2E는 **337 PASS + visual manifest 1 skip** 뒤 기존 Quick Dock 기본 300ms CSS 검사가 병렬 부하에서 종료 phase를 읽어 1회 실패했다. 해당 구간을 pause된 animation frame에서 검사하도록 안정화한 뒤 단독 PASS, 동일 4-worker full E2E 재실행 **338 PASS + 1 skip**로 완주했다. Clean-room frontend **162**/backend **45**, npm audit 0 vulnerabilities와 diff check가 PASS했다.
- **증적**: `docs/screenshots/redevelopment/detail-custom-fields-ui/{desktop,mobile}.png`을 실제 Chromium에서 확인해 desktop property hierarchy, 390px mobile containment, inactive preserved value와 주변 section 비재배치를 검증했다.

---

# UI-190 Work Item Description IA 검증 (2026-07-21)

- **UI 변경**: 작업 상세 설명을 상시 노출되는 편집기 프레임에서 scan-first 본문으로 재구성했다. 읽을 때는 툴바·중첩 테두리 없이 제목과 본문 계층만 보이고, 작성자가 편집 action을 실행한 동안에만 기존 rich-text toolbar와 명시적 저장·취소 control이 나타난다. 같은 계층을 desktop과 mobile에서 유지하며 빈 설명도 권한에 맞는 compact 상태로 표시한다.
- **기능/API 반영**: 저장은 최신 work item version을 포함한 실제 PATCH를 사용하고 성공 응답으로 상세 query cache를 갱신한다. 취소와 `Escape`는 요청 없이 원문으로 복귀하며, 409 conflict 또는 일반 오류에서는 사용자가 작성한 draft를 유지해 다시 저장할 수 있다. 기존 plain-text 설명과 동등한 paragraph HTML은 변경 없음으로 판정한다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다.
- **권한/이연 항목**: Writer만 편집 action과 editor를 사용할 수 있고 viewer는 본문 또는 읽기 전용 빈 상태만 본다. 이번 description surface의 모든 control은 실제 state 또는 mutation에 연결돼 있으며 mock/dead control과 장식용 action은 없다. AI 요약의 on-demand 정보 계층은 후속 detail surface로 이연한다.
- **검증**: typecheck PASS, lint PASS(기존 Fast Refresh warning 4건), production build PASS(기존 large chunk warning), unit **108 PASS**, component **8 PASS**, 저장·취소·409 draft 보존·viewer·empty·desktop/mobile 계층을 포함한 focused E2E **6 PASS**다. 최종 4-worker full E2E는 **343 PASS + opt-in visual QA manifest 1 skip**로 재시도 없이 완주했다. 그 전 1차 full E2E에서 신규 설명 시나리오는 모두 통과했고 기존 프로젝트 sidebar focus와 custom-field 오류 alert가 각 1회 timeout 됐으나, 두 시나리오를 각각 포함한 `--repeat-each=5 --workers=1` 격리 검증도 **10/10 PASS**였다. Clean-room frontend **162**/backend **45**, OpenAPI type parity, npm audit 0 vulnerabilities와 diff check가 PASS했다.
- **증적**: `docs/screenshots/redevelopment/detail-description-ui/{desktop,mobile-edit}.png`을 실제 Chromium에서 확인해 scan-first 본문, 명시적 editor 전환과 390px mobile containment를 검증했다.

---
