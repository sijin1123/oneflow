# OneFlow — fable5 전수 검사 감사 리포트 + 수정 로그

> 실행 모델: **Claude Fable 5** (`claude-fable-5`) · 검사일: 2026-07-05 ~ 2026-07-06
> 대상: `github.com/sijin1123/oneflow` · 성격: 릴리스 차단(release-blocking) 전수 검사 + 부족분 마무리 구현 패스
> 근거 문서: `docs/goals/ONEFLOW_GREENFIELD_GOAL.md`, `oneflow/docs/FABLE5_INSPECTION_HANDOFF.md`

## 0. 요약 (TL;DR)

Opus 4.8가 구현·머지한 OneFlow(개발 PR #1–#26 + 문서/검증/정책 PR #27–#30)를 fable5가 전 영역 검사한 결과, **백엔드 도메인 로직은 매우 견고**(원자적 낙관적 동시성, 인가 경계, 트랜잭션 원자성, 새니타이즈, 테스트가 일관되게 높은 품질)했으나, 결함이 **CSV I/O·소수의 동시성/널 엣지·프론트엔드 사용성·이미 구현된 백엔드 기능의 UI 미배선**에 집중되어 있었습니다.

명시 후속 2개(실시간 협업, UUIDv7)를 제외한 **모든 필수 지적·마무리 구현을 16개의 작은 PR(#31–#45, #54)로 수정·테스트·재검증·머지 완료**했습니다.

| 지표 | 검사 착수(baseline) | 최종(main `005b442`) |
|---|---|---|
| main HEAD | `dbb3695` (PR #30) | `005b442` (PR #54) |
| 누적 머지 PR | #1–#30 | #1–#45, #54 (+16 수정 PR) |
| 마이그레이션 | 0001–0013 | 0001–**0015** |
| 백엔드 테스트(pytest) | 164 | **190** |
| 프론트 unit / component / e2e | 13 / 4 / 23 | **21 / 4 / 30** |
| CI | 4잡 green | 4잡 green (dependabot·주간 스케줄 추가) |

**최종 재검증**: 백엔드 ruff PASS · pytest 190 pass · migrate smoke(up/down/up, 0001–0015) PASS · OpenAPI 드리프트 OK · 클린룸 게이트 PASS · 프론트 typecheck/lint/unit(21)/component(4)/build/e2e(30) PASS · main CI green.

## 1. 검사 방법

1. **착수 조건 확인**: active model = fable5 확인, main HEAD·CI·PR 재측정.
2. **§2 전 영역 8-클러스터 fan-out**: 격리된 read-only 감사 에이전트 8개를 병렬 실행 — (1) 백엔드 정확성·동시성, (2) 보안·인가, (3) DB·마이그레이션, (4) API 계약·타입, (5) 프론트 품질·a11y, (6) 테스트·CI, (7) §3.2 제품 완성도, (8) 클린룸·라이선스·문서.
3. **자체 재확인(§3)**: 모든 지적을 fable5가 실제 코드로 직접 재현/확인(예: DB 제약 이중 프리픽스는 라이브 DB 쿼리로, CSV 체크섬 Decimal/float는 소스 로직으로, null-name→500은 스키마·엔드포인트로 검증). 과대 지적은 기각(예: "프로덕션 인증 부재"는 목표 Non-goal인 프로덕션 SSO로 재분류).
4. **수정 → 테스트 → 재검증 → 커밋 → PR → CI green → 머지**를 §4 규칙(작은 PR, 기본 브랜치 직접 커밋 금지, 검증 실패 상태 PR 금지)에 따라 반복.

## 2. §2 영역별 결과 요약

| 영역 | 결과 | 조치 |
|---|---|---|
| backend 정확성/동시성 | 견고. CSV 체크섬 Decimal/float 드리프트, last-owner 경합, null-name→500, automation 비결정성, time/cost 미소값→500 결함 | PR #31, #32 |
| security/인가 | 인가 경계·존재은닉·XSS·시크릿 미커밋 견고. CSV import 미새니타이즈, CSV export 수식주입 | PR #31 |
| DB/migrations | up/down 정확. CHECK 이름 이중 프리픽스, project_members.user_id 미인덱스, seed 상태 누락 | PR #33, #54 |
| auth/permissions | 인가 매트릭스 정확. 다수 owner-403·교차사용자·외부ID 경계 테스트 공백 | PR #34 |
| workflow | 구성형 상태 견고. rename 라벨이 보드만 반영, reorder 비원자 | PR #39 |
| timeline/Gantt | 경량이나 실사용상 today·마일스톤 마커 부재 | PR #43 |
| time/cost | 정확. 미소값 500 엣지 | PR #32 |
| dashboard/report | 집계 정확·N+1 없음. 라벨 일관성 | PR #39 |
| settings | 예산만 편집 가능(이름/설명 편집 UI 부재) | PR #41 |
| API contract | 드리프트 게이트 견고. 409 shape·enum·untyped PATCH·assignee 필터 | PR #35, #39, #40 |
| tests | 백엔드 강함. 권한 매트릭스·엣지·프론트 create 공백 | PR #34, 각 PR 동반 테스트 |
| CI | 4잡 견고. security-audit 미배선(스케줄·dependabot) | PR #45 |
| env/secrets | 시크릿 미커밋·플래그 안전기본 확인 | (지적 없음) |
| security | nh3·dev 루프백 가드·시드 가드 견고. CSV 2건 | PR #31 |
| accessibility | 라벨·focus 관리 양호. aria-live·확인·미저장가드 부재 | PR #44 |
| performance | N+1 없음. 200건 무성 절단(전 뷰) | PR #42 |
| clean-room/license | @plane/*·GPL/AGPL 0건, 시크릿 0건. LICENSE·NOTICE 부재, 문서 낡음 | PR #45 |
| documentation | VERIFICATION·CLEANROOM 정확. README 4잡→3잡 오기·경로 깨짐 | PR #45 |
| worklog | 정량 주장 정확. PR #28 이력행 누락(경미) | 본 리포트/워크로그 갱신 |

## 3. 분류

### 3.1 명시 후속으로 인정(미구현을 결함으로 보지 않음)

| 항목 | 상태 |
|---|---|
| 실시간 협업(Yjs/WebSocket 다중 편집) | 미구현 유지 — 문서/회의/위키의 일반 CRUD·낙관적 동시성·XSS 경계는 검사·보완 완료. 409 UX는 "인지 하 마지막 저장 승리"로 개선(PR #35). |
| UUIDv7 전환 | 미전환 유지 — UUID/FK/인덱스/마이그레이션 무결성은 검사·보완 완료(0014 제약명, 0015 인덱스). |

### 3.2 필수 지적·마무리 구현 → 전부 수정·머지 완료 (§4. 수정 로그 참조)

보안·정확성 6건, 동시성/무결성 4건, 프론트 데이터 손실/정확성 8건, 이미 구현된 기능의 UI 배선 3건, §3.2 완성도 3건, a11y/UX 4건, DB/문서/인프라 하우스키핑 다수 — 아래 §4에 PR별 정리.

### 3.3 권고(RECOMMENDED)·이연 — 판단 근거와 함께 문서화(미구현)

| 항목 | 판단 |
|---|---|
| 프로덕션 OIDC/SSO + 사용자 CRUD/초대 | **목표 Non-goal(프로덕션 SSO)**. 아키텍처는 OIDC-ready이며 dev auth는 프로덕션에서 기동 자체가 차단(fail-closed, config `_startup_guards`). 릴리스 전 1순위 인프라 요건으로 기록하되 본 패스에서 구현하지 않음. |
| 상태 KEY 추가/비활성화(신규 워크플로우 상태) | 전역 CHECK 제약·enum·마이그레이션이 얽힌 큰 스키마 변경. 현재 6상태 + rename/reorder + **전역 라벨 일관성(PR #39)** 으로 실사용 커버. |
| 프로젝트 아카이브 라이프사이클 | 이름/설명 편집은 구현(PR #41). 아카이브 플래그·목록 필터는 더 큰 변경으로 이연. |
| 타임라인 의존성 화살표·줌/스케일 | today·마일스톤 마커는 구현(PR #43). 의존성 렌더·줌은 경량 유지 원칙상 이연. |
| 대규모 목록 가상화(virtualization) | 정확성(전 페이지 로드)·정직한 총계는 구현(PR #42). 성능 가상화는 이연. |
| 자동화 규칙 편집/추가 트리거·액션, 리포트 export, 알림 설정, 액션아이템 편집/WP 전환, WP-첨부 링크, 스토리지 인터페이스, AI provider 설정 seam, 보드 DnD, 트리 roving-tabindex, 활동 project_id 비정규화, pg_trgm 인덱스, 액션 SHA 핀, model server_default 정렬 | 실사용 필수는 아니며 각각 별도 후속. 기본 기능은 동작·검증됨. |

## 4. 수정 로그 (PR별)

| PR | 영역 | 결함 → 조치 | 검증 |
|---|---|---|---|
| [#31](https://github.com/sijin1123/oneflow/pull/31) | CSV 보안·정합성 | import `description` 미새니타이즈(XSS 경계 위반)→nh3 적용; export 수식주입(CWE-1236)→`'` 가드+import unguard(왕복 무손실); 체크섬 Decimal/float 드리프트→정규화; Excel UTF-8 BOM | pytest 164→170 |
| [#32](https://github.com/sijin1123/oneflow/pull/32) | 백엔드 null/경합/검증 | milestone/project `{"name":null}`→422(500 방지); last-owner 경합→advisory lock; automation 다중규칙 ORDER BY; add_member IntegrityError→409; time/cost 미소값→422 | 170→175 |
| [#33](https://github.com/sijin1123/oneflow/pull/33) | DB 제약명 | 이중 프리픽스 CHECK 11개→정규명 RENAME(마이그레이션 0014) | 175→176, migrate smoke |
| [#34](https://github.com/sijin1123/oneflow/pull/34) | 인가 테스트 | saved-filter 교차사용자·oidc 501·owner-403·외부ID 404·time delete 인가 회귀 커버 | 176→185 |
| [#35](https://github.com/sijin1123/oneflow/pull/35) | 프론트 뮤테이션 신뢰성 | 저장 실패 무성(데이터 손실)→인라인 오류; 422 배열 파싱; 문서/회의 409 초안 파괴→보존; 무효화 누락; 이중제출 가드 | unit 13→17, e2e |
| [#36](https://github.com/sijin1123/oneflow/pull/36)·[#37](https://github.com/sijin1123/oneflow/pull/37) | 프론트 시간대 | 타임스탬프·캘린더 today UTC→로컬; TZ-fragile 테스트 핫픽스 | unit 17→20(TZ 3존) |
| [#38](https://github.com/sijin1123/oneflow/pull/38) | 라우팅 | RR 기본 영어 오류화면→한국어 errorElement + 404 catch-all | e2e 23→24 |
| [#39](https://github.com/sijin1123/oneflow/pull/39) | 워크플로우 라벨/재정렬 | rename 라벨 전역 적용(칩·필터·드로어·대시보드·자동화·이력); 원자 재정렬 엔드포인트 + row 리싱크 | backend 185→188, e2e 24→25 |
| [#40](https://github.com/sijin1123/oneflow/pull/40) | 담당자 UI | 백엔드만 지원하던 담당자를 드로어·목록·필터에 배선(알림 도달성 복구) + list assignee 필터 | backend 188→189, e2e 25→27 |
| [#41](https://github.com/sijin1123/oneflow/pull/41) | 프로젝트 생성 | CLI 전용 온보딩→생성 폼 + 이름/설명 편집 UI | e2e 27→28 |
| [#42](https://github.com/sijin1123/oneflow/pull/42) | 페이지네이션 | 전 뷰 200건 무성 절단→전 페이지 로드 + 정직한 총계 | e2e 28→29 |
| [#43](https://github.com/sijin1123/oneflow/pull/43) | 타임라인·검색 | today 선·마일스톤 마커; 문서/회의 제목 검색 | unit 20→21 |
| [#44](https://github.com/sijin1123/oneflow/pull/44) | a11y·데이터손실 | 삭제 확인·미저장 가드·첨부 URL 스킴 검증·aria-live | e2e 29→30 |
| [#45](https://github.com/sijin1123/oneflow/pull/45) | 라이선스·문서·인프라 | LICENSE + THIRD-PARTY-NOTICES; dependabot + CI 주간 스케줄; README/경로/클린룸 노트 정정 | 클린룸 게이트 PASS |
| [#54](https://github.com/sijin1123/oneflow/pull/54) | DB 인덱스·seed | project_members.user_id 인덱스(0015); seed 기본 상태 생성 | 189→190, migrate smoke |

## 5. 최종 재검증 (main `005b442`)

| 검증 | 결과 |
|---|---|
| ruff format --check / ruff check | PASS |
| pytest -q | **190 passed** |
| migrate smoke (up/down/up, 0001–0015) | PASS |
| OpenAPI 드리프트 게이트 | OK (스키마 일치) |
| 클린룸 게이트 | PASS |
| 프론트 typecheck / lint | PASS |
| 프론트 unit(node --test) / component(vitest) | 21 / 4 PASS |
| 프론트 build / e2e(Playwright) | PASS / **30 passed** |
| main CI (backend·frontend·cleanroom·security-audit) | green |

## 6. 완료 정의 충족

- Phase 1/2/3 + 후속 모듈 구현·머지 ✅
- 사용자 fable5 승인 ✅ / active model = fable5 확인 ✅
- fable5 전수 검사 리포트(본 문서) ✅
- 실시간 협업/UUIDv7 외 필수 수정·마무리 구현 머지·재검증 green ✅ (PR #31–#45, #54)
- `docs/PROJECT_WORKLOG.md`(B-018) 갱신 ✅
