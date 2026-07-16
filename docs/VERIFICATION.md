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
