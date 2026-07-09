# OneFlow Clean-room Notes

> Rule: OpenProject(GPLv3)/Plane(AGPL-3.0)은 행동·정보구조 관찰만 허용. 소스/스키마/에셋 복사 금지.
> 이 파일은 기능 단위 "관찰 → 독자 구현 결정" 기록과 게이트 증적을 담는 감사 문서다.

## 준수 선언 (첫 PR)

- [x] OpenProject/Plane 저장소에서 파일 내용을 복사·번역·이식하지 않았다(구조·행동 관찰만).
- [x] `@plane/*` 패키지를 import하지 않았다 — `scripts/check_cleanroom.sh` 자동 검사 PASS.
- [x] 의존성 라이선스 전수 스캔 — GPL/AGPL 0건(아래 게이트 로그), UNKNOWN fail-closed 정책.
- [x] 아이콘은 lucide-react(ISC), 색/토큰은 OneFlow 자체 정의(`--of-*`). 레퍼런스 로고/폰트/일러스트 미사용.
- [x] DB 스키마는 `docs/ONEFLOW_PLAN.md` §7 명세로부터 작성(레퍼런스 스키마 파일 미참조 — 마이그레이션 0001 docstring에도 명시).
- [x] filename-overlap-reviewed: 게이트 4번(파일명 교집합)이 보고한 항목은 전부 업계 관례 명칭이며, 각 파일 내용은 본 저장소에서 신규 작성됨을 확인함(아래 표).

## 기능 단위 기록

| 기능 | 참고한 공개 자료(행동 관찰) | 참조 금지로 지킨 소스 경로 | 관찰한 행동 요약 | 독자 구현 결정 |
|---|---|---|---|---|
| Work Package 도메인(제목·타입·상태·우선순위·담당·일정·부모) | OpenProject 공개 문서·실행 화면 | `openproject/app/models/**`, `db/**` | 작업 항목이 타입/상태/우선순위/담당/기간/계층을 가짐 | 자체 컬럼 구성·VARCHAR+CHECK 상태값·정수 version 토큰(§6.2)·복합 FK 동일 프로젝트 불변식은 OneFlow 고유 설계 |
| 관계(blocks/precedes/follows/relates) | OpenProject 공개 문서 | `openproject/app/models/relation*` | 작업 간 방향성 있는 관계 유형 존재 | 관계 행에 project_id를 실어 이중 복합 FK로 DB 강제 — 레퍼런스와 다른 독자 구조 |
| 워크스페이스 셸/사이드바/목록/보드/드로어 | Plane 실행 화면(UI 흐름 관찰) | `plane/apps/web/**`, `plane/packages/**` | 좌측 컴팩트 네비 + 목록/보드 + 우측 상세 패널 패턴 | React Router+TanStack Query+자체 8종 컴포넌트로 신규 작성. 레이아웃 치수·색·아이콘은 자체 토큰 |
| 상태 칩/우선순위 표기 | Plane/Linear 화면 관찰 | 상동 | 상태를 점+라벨 칩으로 표기하는 관례 | 자체 팔레트(oklch)와 라벨(한국어) 정의 |
| 옵티미스틱 동시성 UX(409 → 알림+재로드) | 일반 웹 관례 | — | 편집 충돌 시 사용자 통지 후 최신화 | 순수 함수 `decideOnPatchError` + node --test 유닛 |
| 시간/비용 기록의 `spent_on` 컬럼명(time_entries·cost_entries) | OpenProject/Redmine 공개 스키마·API v3 관찰 | `openproject/app/models/**` | 일자 컬럼에 `_on` 접미사를 쓰는 관례(Rails/Redmine 유래) | 개별 식별자는 저작권 대상이 아니며 공개 API에서 관찰 가능. 컬럼 의미·타입·제약은 본 저장소에서 독자 설계(Numeric 스케일·CHECK·인덱스 자체 정의) — attested-independent-derivation |
| Reverse Spec 기반 검색/커맨드 팔레트 준비 | `docs/plane-poc-reverse-spec/`의 전역 검색/커맨드 팔레트 행동 관찰 | `plane/apps/**`, `plane/packages/**` | 전역 진입점이 여러 리소스 검색 결과를 빠르게 노출 | Plane 코드/스타일/카피 없이 기존 OneFlow `/api/v1/search`를 강화. 멤버십·아카이브 가시성, snippet plain-text 경계, default-off 운영 flag를 독자 구현·테스트로 고정 |
| Reverse Spec 기반 전역 단축키/오버레이 가드 | `docs/plane-poc-reverse-spec/`의 전역 검색 진입과 키보드 접근성 요구 | `plane/apps/**`, `plane/packages/**` | 전역 검색은 앱 chrome에서는 빠르게 열리되 입력/에디터/모달 조작을 침범하지 않아야 함 | OneFlow 자체 `shortcuts.ts` helper와 overlay registry를 신규 작성. DOM 구조·CSS·컴포넌트 복사 없이 editable/Tiptap/IME/overlay guard를 node unit test로 고정 |
| Reverse Spec 기반 커맨드 팔레트 UI | `docs/plane-poc-reverse-spec/`의 S002/S003 검색 focused/results 상태와 RSP-001 backlog | `plane/apps/**`, `plane/packages/**` | 전역 검색 modal이 그룹 결과, 범위 전환, advanced search row, keyboard navigation을 제공 | OneFlow 자체 shell component와 result mapper를 신규 작성. 기존 OneFlow `/api/v1/search` 응답만 사용하고 Plane DOM/CSS/카피/아이콘/색상/소스는 열람·이식하지 않음 |
| Reverse Spec 기반 Display menu | `docs/plane-poc-reverse-spec/`의 Display popover와 RSP-002 backlog | `plane/apps/**`, `plane/packages/**` | 목록 표시 설정은 열/정렬 같은 view option을 한 메뉴에서 조정하고 URL/view state로 지속됨 | 기존 OneFlow `columns`/`sort` URL 계약 위에 자체 `DisplayMenu` 컴포넌트를 신규 작성. Plane DOM/CSS/카피/에셋 없이 Radix primitive와 자체 canonicalizer로 열·정렬·커스텀 필드 열을 통합 |
| UI-first app shell/navigation | `docs/plane-poc-reverse-spec/`의 workspace navigation, compact sidebar, topbar context, mobile shell behavior 관찰 | `plane/apps/**`, `plane/packages/**` | 앱 chrome은 workspace 영역, 운영 영역, active project navigation을 구분하고 좁은 화면에서는 drawer로 전환되어야 함 | OneFlow 자체 `AppShell`/`Sidebar`/`Topbar`를 재구성. Plane 소스/DOM/CSS/에셋/카피 없이 lucide icons와 OneFlow `--of-*` tokens만 사용하고, 기존 route/API 계약 위에서 모바일 drawer와 route context를 신규 구현 |
| UI-first design system foundation | `docs/plane-poc-reverse-spec/05-design-system-tokens.md`, `06-component-patterns.md`의 density, focus, hover, menu, elevation, skeleton 방향 | `plane/apps/**`, `plane/packages/**` | dense enterprise controls, quiet borders, near-instant menus, visible focus, low elevation overlays | OneFlow `index.css`의 자체 OKLCH/CSS variable token을 확장하고, 자체 UI primitives(Button/Input/Select/Textarea/Dropdown/Sheet/Skeleton/Badge/RichText toolbar/CommandPalette)를 같은 token contract로 정규화. Plane 수치·CSS·DOM·패키지 복사 없음 |
| UI-first workspace work item grid | `docs/plane-poc-reverse-spec/`의 D004/S009-S015 all work items grid와 RSP-003 backlog | `plane/apps/**`, `plane/packages/**` | 워크스페이스 단위로 접근 가능한 작업을 프로젝트/상태/우선순위/담당자/일정 컬럼의 dense table surface에서 탐색 | 기존 OneFlow search membership boundary를 확장한 `/search/work-packages` 계약과 신규 `/work-items` page surface를 자체 구현. Plane table DOM/CSS/컬럼 메뉴/카피/에셋 없이 OneFlow table/chip primitives, UI-02 tokens, API tests로 독립 구현 |
| UI-first work item view controls | `docs/plane-poc-reverse-spec/`의 work item toolbar, Display menu, filters, saved views 패턴 관찰 | `plane/apps/**`, `plane/packages/**` | 검색, 필터, 표시 옵션, 저장 뷰가 같은 작업 목록 surface에서 조밀하게 작동하고 URL/view state로 지속됨 | OneFlow 기존 `columns`/`sort`/saved filter 계약 위에서 `ListPage`, `DisplayMenu`, `SavedFilters` UI를 재구성. Plane DOM/CSS/카피/패키지/에셋 없이 자체 URL state, Radix primitive, lucide icons, UI-02 tokens로 구현 |

## 게이트 실행 증적

- 로컬: `bash scripts/check_cleanroom.sh` → PASS (실행 로그는 `docs/VERIFICATION.md`).
- CI: `.github/workflows/ci.yml`의 `cleanroom` 잡에서 동일 스크립트 실행.
- 게이트 4번(파일명 교집합) 보고 항목 검토: `button.tsx`·`badge.tsx`·`input.tsx` 등 UI 프리미티브 관례명과 `health.py`·`projects.py` 등 도메인 관례명은 이름만 겹칠 뿐이며, 내용은 전부 본 저장소에서 신규 작성(shadcn 스타일 프리미티브는 MIT 패턴의 자체 구현). — filename-overlap-reviewed

## 자동 게이트의 한계(PLAN §10)

리터럴 `@plane/` 문자열·라이선스 텍스트·파일명 수준만 자동 탐지된다. 소스를 보며 변수명만 바꿔 옮기는 이식은 자동으로 잡히지 않으므로, PR 설명의 수동 확인 체크박스("소스 파일을 열어 보며 옮겨 적지 않았음")가 이중 방어선이다.

라이선스 스캔의 범위: 게이트 2번은 `apps/web`의 production 의존성만, 3번은 `apps/api` 백엔드만 자동 스캔한다. 프론트 devDependencies(vitest·playwright·oxlint·typescript 등)와 `packages/shared`(openapi-typescript)는 자동 스캔 대상에서 제외되지만, 전수 수동 확인 결과 모두 MIT/Apache-2.0(카피레프트 0건)임을 확인했다(THIRD-PARTY-NOTICES.md). GPL/AGPL/SSPL·`@plane/*`·`@tiptap-pro`는 전 트리에서 0건.
