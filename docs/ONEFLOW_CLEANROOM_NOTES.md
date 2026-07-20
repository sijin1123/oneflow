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
| UI-first work item detail IA | `docs/plane-poc-reverse-spec/`의 detail drawer/full-page, activity tabs, property panel 정보구조 관찰 | `plane/apps/**`, `plane/packages/**` | 작업 상세는 핵심 제목/상태/액션, 속성 패널, 본문 개요, 활동/댓글 흐름을 분리해 좁은 표면에서도 탐색 가능해야 함 | 기존 OneFlow `Sheet`, `RichTextEditor`, work package sections, mutation hooks를 재배치해 header/action row, overview/activity tabs, property panel을 독자 구현. Plane DOM/CSS/source/assets/copy 없이 기존 OneFlow field ids와 API contract를 유지하고 UI-02 token/classes만 사용 |
| UI-first full-page work item detail | `docs/plane-poc-reverse-spec/`의 full-page detail mode와 workspace/global search result navigation 관찰 | `plane/apps/**`, `plane/packages/**` | 목록 drawer는 빠른 편집을 제공하고, workspace/global search에서는 안정적인 상세 URL로 진입할 수 있어야 함 | UI-04A `WorkPackageDetailPanel`을 재사용하는 OneFlow 고유 `DetailPage` route를 추가. 기존 `?wp=` drawer deep link는 유지하고, `/projects/:projectId/work-packages/:wpId` page route, topbar context, all-work/search/command-palette routing만 자체 React Router 구현으로 연결 |
| UI-first common states/mobile QA | `docs/plane-poc-reverse-spec/05-design-system-tokens.md`, `06-component-patterns.md`의 empty/loading/error/skeleton 및 모바일 QA 방향 | `plane/apps/**`, `plane/packages/**` | 상태 화면은 빈 목록, 로딩, 오류를 명확히 구분하고 모바일에서도 화면 폭을 넘지 않아야 함 | OneFlow 자체 `states.tsx`와 RouteError fallback을 재구성해 skeleton row geometry, wrapped copy, request-id error metadata, 390x844 overflow guard를 구현. Plane DOM/CSS/카피/에셋 없이 lucide icons, OneFlow tokens, Playwright screenshots로 독립 검증 |
| UI-first settings/admin IA | `docs/plane-poc-reverse-spec/`의 settings surface, workspace/admin navigation, responsive dense panels 관찰 | `plane/apps/**`, `plane/packages/**` | 설정은 프로젝트/개인/관리/운영 표면을 구분하되 같은 밀도와 탐색 패턴을 공유하고 좁은 화면에서도 테이블·탭이 페이지 폭을 깨지 않아야 함 | OneFlow 자체 `SettingsShell`/`SettingsFrame`/`SettingsSection`/`SettingsTabList`를 신규 작성해 기존 설정·관리·상태 화면을 재구성. Plane 소스/DOM/CSS/카피/에셋 없이 기존 OneFlow permission/admin/status API와 UI-02 token contract만 사용 |
| UI-first import/export/operations hub | `docs/plane-poc-reverse-spec/`의 import/export hub, operations navigation, settings-adjacent data management surface 관찰 | `plane/apps/**`, `plane/packages/**` | 가져오기/내보내기 같은 데이터 작업은 목록 안에만 숨어 있지 않고 운영 표면에서 프로젝트별로 찾을 수 있어야 하며 모바일에서도 액션이 보여야 함 | OneFlow 자체 `/operations` route와 list deep-link contract(`?ops=import`)를 신규 작성. 기존 OneFlow CSV import/export hooks, SettingsShell, sidebar/topbar route context만 재배치하고 Plane 소스/DOM/CSS/카피/에셋 없이 구현 |
| UI-first inbox/notification center | `docs/plane-poc-reverse-spec/`의 inbox/full-page notification center, bell entry, unread/read scan pattern 관찰 | `plane/apps/**`, `plane/packages/**` | 알림 벨은 빠른 확인을 제공하되, 모든 알림을 읽지 않음/읽음 상태로 스캔하고 처리하는 전체 화면 표면이 필요함 | OneFlow 자체 `/inbox` route, notification view helper, sidebar/topbar entry, mobile grouping UI를 신규 작성. 기존 OneFlow `/api/v1/me/notifications` user-scoped API와 read mutations만 재사용하고 Plane 소스/DOM/CSS/카피/에셋 없이 구현 |
| UI-first workspace home/quick links | `docs/plane-poc-reverse-spec/`의 workspace home, quick links, project shortcut, app home scan pattern 관찰 | `plane/apps/**`, `plane/packages/**` | 앱 홈은 RSP 번호순 기능 목록이 아니라 사용자가 자주 드나드는 표면과 프로젝트 바로가기를 한 화면에서 빠르게 제공해야 함 | OneFlow 기존 `/my`를 workspace home으로 재구성하고 `QuickLink`/프로젝트 바로가기/개인 작업 요약을 자체 구현. 기존 My Work/Projects/Notifications/My Time API만 재사용하고 Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/route contract로 구현 |
| UI-first AI workspace summary surface | `docs/plane-poc-reverse-spec/`의 AI/RSP-011, workspace home, scoped assistant entry 관찰 | `plane/apps/**`, `plane/packages/**` | AI 기능은 사용자가 볼 수 있는 작업 범위 안에서 상태를 명확히 드러내고, 꺼진 기능이나 미배선 생성 버튼을 노출하지 않아야 함 | OneFlow 기존 `/api/v1/capabilities`, `/api/v1/work-packages/{id}/summary`, `/my` My Work data를 재사용해 AI workspace panel을 신규 작성. Plane 소스/DOM/CSS/카피/에셋 없이 flag OFF/ON, 가시 작업 후보, detail drawer summary 진입만 OneFlow token/lucide/route contract로 구현 |
| UI-first documents/wiki content surface | `docs/plane-poc-reverse-spec/`의 wiki/content list, page tree, detail property panel, archive/visibility cues 관찰 | `plane/apps/**`, `plane/packages/**` | 문서/위키는 단순 편집기 링크 목록이 아니라 content hub, 계층 탐색, 속성/연결 패널, 모바일 상태가 함께 정리되어야 함 | OneFlow 기존 documents/comments/attachments/work-package-links API와 자체 `buildDocTree`를 유지하면서 `/documents` 목록과 editor IA를 재구성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components와 기존 authz/read-only 계약으로 구현 |
| UI-first meetings collaboration surface | `docs/plane-poc-reverse-spec/`의 collaboration list/detail, property panel, action item, follow-up/navigation surface 관찰 | `plane/apps/**`, `plane/packages/**` | 회의는 안건/회의록 편집기만이 아니라 템플릿, 후속 회의, 반복, 액션 아이템, 속성 요약이 한 협업 표면 안에서 정리되어야 함 | OneFlow 기존 meetings/templates/action-items/follow-up API를 유지하면서 `/meetings` 목록과 meeting detail IA를 재구성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components와 기존 viewer/read-only 계약으로 구현 |
| UI-first files/storage collaboration surface | `docs/plane-poc-reverse-spec/`의 files/storage, attachment/link, property/anchor, empty/mobile surface 관찰 | `plane/apps/**`, `plane/packages/**` | 파일은 단순 링크 목록이 아니라 업로드, 외부 링크, 작업/문서 anchor, 읽기 전용 상태, 사용량 요약이 함께 스캔되어야 함 | OneFlow 기존 attachments/upload/download/document/work-package anchor API를 유지하면서 `/files`를 storage hub로 재구성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components와 기존 viewer/read-only/http(s) validation 계약으로 구현 |
| UI-first automation rule item actions surface | `docs/plane-poc-reverse-spec/`의 settings/governance surface, row action menu, read-only/mobile interaction pattern 관찰 | `plane/apps/**`, `plane/packages/**` | 자동화 규칙은 목록에서 edit, enable/disable, reorder, delete, execution feedback을 일관된 action affordance로 제공하고 viewer에게는 읽기 전용 상태가 명확해야 함 | OneFlow 기존 automation rule list/create/update/delete/reorder/run-history API 위에서 자체 `AutomationManager`와 `InlineActionMenu`를 작성. Plane 소스/DOM/CSS/카피/에셋 없이 lucide icons, OneFlow tokens, 기존 owner/viewer authz 계약, Playwright mobile QA로 독립 구현 |
| UI-first planning/schedule surface | `docs/plane-poc-reverse-spec/`의 planning navigation, backlog/board/timeline/calendar mode switching, cycle/module planning entry surface 관찰 | `plane/apps/**`, `plane/packages/**` | 계획 화면은 기능별 낱장 페이지가 아니라 backlog, board, timeline, calendar, cycle/module planning entry가 같은 프로젝트 컨텍스트와 모드 전환 안에서 이어져야 함 | OneFlow 기존 work packages/cycles/modules/timeline/calendar/board API와 DnD·viewer contracts를 유지하면서 자체 `PlanningSurface`와 dense summary/navigation UI를 신규 작성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components와 기존 permission/read-only 계약으로 구현 |
| UI-first reporting/portfolio surface | `docs/plane-poc-reverse-spec/`의 reports/dashboard-like summary, portfolio comparison, health/progress scan, responsive view-control pattern 관찰 | `plane/apps/**`, `plane/packages/**` | 보고 표면은 프로젝트별 상태·일정·비용·진행률을 조밀하게 비교하고, 전략 묶음/헬스 상태를 모바일에서도 빠르게 스캔할 수 있어야 함 | OneFlow 기존 reports/dashboard/initiatives/projects/activity API를 유지하면서 `ReportingSurface`, portfolio summary/table/timeline, dashboard metric cards, initiatives summary/cards를 자체 구현. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components와 기존 member/owner visibility contract로 구현 |
| UI-first intake/triage surface | `docs/plane-poc-reverse-spec/`의 inbox-like queue, status grouping, request triage, highlighted target, mobile decision controls 관찰 | `plane/apps/**`, `plane/packages/**` | 인테이크는 단순 요청 리스트가 아니라 제출, 검토 대기, 보류, 종료 상태를 한 표면에서 스캔하고 소유자가 빠르게 판정할 수 있어야 함 | OneFlow 기존 intake/members/permissions/work-package deep-link API를 유지하면서 `/intake`를 request inbox로 재구성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components와 기존 owner/member/viewer visibility contract로 구현 |
| UI-first project directory surface | `docs/plane-poc-reverse-spec/`의 workspace navigation, project list density, view control, health/archive scan pattern 관찰 | `plane/apps/**`, `plane/packages/**` | 프로젝트 목록은 단순 링크 목록이 아니라 워크스페이스 디렉터리로서 상태, 작업 규모, 이니셔티브 연결, 보관 포함 여부, 생성 진입점을 한 표면에서 스캔해야 함 | OneFlow 기존 `/api/v1/projects` rollup, client sort, column preference, project creation/template contract를 유지하면서 `/projects`를 자체 directory surface로 재구성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/Radix primitives와 기존 authz/project visibility 계약으로 구현 |
| UI-first search/discovery surface | `docs/plane-poc-reverse-spec/`의 global search, grouped command results, discovery result scan pattern 관찰 | `plane/apps/**`, `plane/packages/**` | 검색은 단순 폼과 긴 목록이 아니라 query control, 권한 범위 내 group summary, result card, snippet, 모바일 스캔 표면을 제공해야 함 | OneFlow 기존 `/api/v1/search` grouped response와 command palette route contract를 유지하면서 `/search`를 자체 discovery surface로 재구성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components와 기존 server-side visibility boundary로 구현 |
| UI-first project governance surface | `docs/plane-poc-reverse-spec/`의 settings/workflow governance, dense settings panels, mobile control grouping 관찰 | `plane/apps/**`, `plane/packages/**` | 프로젝트 설정의 상태, 타입, 자동화 규칙은 보드/목록/필터/리포트와 연결되는 운영 제어면으로 한눈에 스캔되어야 함 | OneFlow 기존 statuses/types/automation APIs와 settings tab route를 유지하면서 workflow overview, status/type panels, automation rule cards, rule builder, mobile QA를 자체 구현. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components와 기존 owner/read-only 계약으로 구현 |
| UI-first user directory surface | `docs/plane-poc-reverse-spec/`의 workspace/admin account directory, user status, membership drilldown, mobile settings surface 관찰 | `plane/apps/**`, `plane/packages/**` | 사용자 관리는 단순 테이블이 아니라 계정 상태 요약, 검색/상태 필터, 관리자/비활성화 controls, 프로젝트 멤버십 확인, 모바일 카드 스캔을 같은 표면에서 제공해야 함 | OneFlow 기존 `/api/v1/users`, `/api/v1/users/:id/memberships`, `/me` 계약을 유지하면서 `/admin/users`를 summary cards, account directory, desktop table, mobile cards로 재구성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow SettingsShell, lucide icons, 자체 tokens, 기존 admin-only/last-active-admin/self-deactivation guard로 구현 |
| UI-first project team/members surface | `docs/plane-poc-reverse-spec/`의 settings/team/members, role management, permission scan surface 관찰 | `plane/apps/**`, `plane/packages/**` | 프로젝트 팀 관리는 단순 멤버 행이 아니라 역할 요약, 멤버 초대, last-owner 보호, 권한 matrix, 모바일 cards가 함께 보여야 함 | OneFlow 기존 project members/current-user/permission-report API를 그대로 유지하면서 `MembersPanel`을 team directory와 role permission surface로 재구성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components와 기존 authz/last-owner 계약으로 구현 |
| UI-first time/cost execution surface | `docs/plane-poc-reverse-spec/`의 detail side-panels, property cards, dense ledger, mobile-safe editing pattern 관찰 | `plane/apps/**`, `plane/packages/**` | 작업 상세의 시간·비용 기록은 단일 입력줄이 아니라 estimate/budget cues, ledger, read-only state, 모바일 cards로 스캔 가능해야 함 | OneFlow 기존 work package time/cost entry API와 viewer/write gates를 유지하면서 `TimeTrackingSection`과 `CostSection`을 accounting cards/ledger/composer surface로 재구성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components와 기존 authz/API 계약으로 구현 |
| UI-first relations/dependencies surface | `docs/plane-poc-reverse-spec/`의 detail dependency cards, relation direction cues, compact composer, mobile-safe scanning pattern 관찰 | `plane/apps/**`, `plane/packages/**` | 작업 관계는 한 줄 텍스트가 아니라 관계/의존 요약, 타입 badge, 방향 cue, linked-item cards, 모바일 composer로 스캔 가능해야 함 | OneFlow 기존 work package relation API와 same-project/viewer gates를 유지하면서 `RelationsSection`을 dependency summary/cards/composer surface로 재구성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components와 기존 authz/API 계약으로 구현 |
| UI-first activity/comments collaboration surface | `docs/plane-poc-reverse-spec/`의 detail activity feed, comment thread, reaction/mention, read-only/mobile scanning pattern 관찰 | `plane/apps/**`, `plane/packages/**` | 작업 활동은 단순 로그와 textarea가 아니라 활동 요약, thread cards, reaction/mention affordance, 모바일 composer가 함께 스캔되어야 함 | OneFlow 기존 work package activities/comments/reactions/mentions API와 viewer gates를 유지하면서 `HistorySection`을 activity/comments collaboration surface로 재구성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components와 기존 authz/plain-text 계약으로 구현 |
| UI-first custom fields/property values surface | `docs/plane-poc-reverse-spec/`의 detail property fields, custom property cards, type/status cue, mobile-safe editing pattern 관찰 | `plane/apps/**`, `plane/packages/**` | 커스텀 필드는 단순 label/input grid가 아니라 필드 수, 값 존재 여부, 타입, 적용 범위, 보존값/read-only 상태가 함께 스캔되어야 함 | OneFlow 기존 custom fields/custom values delta API와 applies-to/viewer gates를 유지하면서 `CustomFieldsSection`을 field value cards surface로 재구성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components와 기존 authz/value 계약으로 구현 |
| UI-first watchers/subscription surface | `docs/plane-poc-reverse-spec/`의 notification/subscription scan pattern과 detail collaboration affordance 관찰 | `plane/apps/**`, `plane/packages/**` | 작업 상세에서 누가 변경 알림을 받는지, 내가 구독 중인지, 어떤 변경이 알림 대상인지 빠르게 스캔되어야 함 | OneFlow 기존 watcher list와 self-service PUT/DELETE API를 유지하면서 detail header의 watcher row를 watcher summary, notification cue strip, participant chips, read-only state, mobile screenshot QA로 재구성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components와 기존 permission contract로 구현 |
| UI-first work item creation/composer surface | `docs/plane-poc-reverse-spec/`의 work item quick-create, dense property controls, mobile composer surface 관찰 | `plane/apps/**`, `plane/packages/**` | 새 작업 생성은 제목만 받는 임시 행이 아니라 타입/상태/우선순위/담당자/기한 같은 핵심 속성을 한 흐름에서 입력해야 함 | OneFlow 기존 project-scoped create API와 work-package type/status/priority/member hooks를 확장해 자체 composer를 구현. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow form primitives, UI tokens, 기존 `?new=1` route contract로 모바일 안전 생성 표면을 구성 |
| UI-first work item bulk edit/selection surface | `docs/plane-poc-reverse-spec/`의 work item list selection, batch action bar, partial-result feedback, mobile table action pattern 관찰 | `plane/apps/**`, `plane/packages/**` | 목록 표면에서 여러 작업을 선택하고 상태/우선순위/담당자를 일괄 변경할 때 선택 요약, 실행 컨트롤, 부분 결과 피드백이 같은 흐름 안에 남아야 함 | OneFlow 기존 `bulk-update` API, work-package list, member/status/priority metadata를 유지하면서 자체 selection bar/result banner를 구현. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow table/form primitives, lucide icons, UI token contract, 기존 viewer/read-only absence 계약으로 구성 |
| UI-first work item saved views management surface | `docs/plane-poc-reverse-spec/`의 saved view creation, active view indication, share/lock/delete controls, mobile list control pattern 관찰 | `plane/apps/**`, `plane/packages/**` | 저장 뷰는 단순 칩 목록이 아니라 현재 적용 상태, 공유/개인/잠금 상태, 저장 폼, 초기화 액션을 한 표면에서 스캔할 수 있어야 함 | OneFlow 기존 saved filter API와 URL param canonicalization을 유지하면서 자체 `SavedFilters` management surface를 구현. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow Badge/Button/Input/Select primitives, lucide icons, 기존 author-only lock/share/delete 계약으로 구성 |
| UI-first work item row actions surface | `docs/plane-poc-reverse-spec/`의 work item list/grid row affordance, detail navigation, quick action, mobile menu pattern 관찰 | `plane/apps/**`, `plane/packages/**` | 목록 행은 단순 열람뿐 아니라 상세 열기, 전체 페이지 이동, 링크 복사, 복제, 이동 같은 반복 조작을 행 맥락에서 빠르게 제공해야 함 | OneFlow 기존 `?wp=` drawer, full-page detail route, duplicate/move mutation hooks를 재사용하는 자체 `WorkPackageRowActions`를 신규 작성. Plane DOM/CSS/카피/에셋 없이 Radix dropdown primitive, lucide icons, OneFlow tokens, viewer/read-only gates로 구현 |
| UI-first board/card actions surface | `docs/plane-poc-reverse-spec/`의 board card hover/touch actions, quick detail, move/duplicate, read-only action affordance 관찰 | `plane/apps/**`, `plane/packages/**` | 보드 카드에서도 목록 행처럼 빠른 상세 진입, 링크 복사, 복제, 이동, 권한별 쓰기 액션 표시가 필요함 | OneFlow 자체 `BoardCardActions` 컴포넌트를 신규 작성하고 기존 drawer/full-page/duplicate/move route 및 mutation contract만 연결. Plane 소스/DOM/CSS/카피/에셋 없이 Radix dropdown, lucide icons, OneFlow token classes, 기존 authz 상태로 구현 |
| UI-first calendar item actions surface | `docs/plane-poc-reverse-spec/`의 calendar/date item quick actions, detail navigation, move/duplicate, read-only action affordance 관찰 | `plane/apps/**`, `plane/packages/**` | 캘린더 항목에서도 목록 행과 보드 카드처럼 빠른 상세 진입, 링크 복사, 복제, 이동, 권한별 쓰기 액션 표시가 필요함 | OneFlow 자체 `CalendarItemActions` 컴포넌트를 신규 작성하고 기존 calendar list data, drawer/full-page/duplicate/move route 및 mutation contract만 연결. Plane 소스/DOM/CSS/카피/에셋 없이 Radix dropdown, lucide icons, OneFlow token classes, 기존 authz 상태로 구현 |
| UI-first work item tree/hierarchy item actions | `docs/plane-poc-reverse-spec/`의 hierarchy/list row action, quick detail, full-page detail, mobile touch action affordance 관찰 | `plane/apps/**`, `plane/packages/**` | 계층 행은 확장/접기와 항목 작업이 충돌하지 않으면서 빠른 상세, 전체 페이지, 링크 복사, 복제, 이동 진입점을 제공해야 함 | OneFlow 기존 tree builder, `?wp=` drawer state, full-page detail route, duplicate/move API를 재사용해 자체 `TreeItemActions` menu를 신규 작성. Plane 소스/DOM/CSS/카피/에셋 없이 Radix primitive, lucide icons, OneFlow tokens, viewer read-only gate로 구현 |
| UI-first timeline item action surface | `docs/plane-poc-reverse-spec/`의 timeline/Gantt item interaction, quick action, detail navigation, read-only cue 관찰 | `plane/apps/**`, `plane/packages/**` | 일정 막대에서도 목록/보드/트리와 같은 항목 단위 빠른 작업이 가능해야 하며 모바일에서는 hover 없이 열려야 함 | OneFlow 기존 DHTMLX integration과 work-package duplicate/move/detail contracts 위에 자체 `TimelineItemActions` 메뉴를 신규 작성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components, explicit event suppression, viewer read-only guard, Playwright mobile screenshot으로 검증 |
| UI-first backlog item action surface | `docs/plane-poc-reverse-spec/`의 backlog/planning item interaction, quick action, detail navigation, read-only cue 관찰 | `plane/apps/**`, `plane/packages/**` | 백로그 행에서도 목록/보드/타임라인과 같은 항목 단위 빠른 작업이 가능해야 하며 cycle assignment와 충돌하지 않아야 함 | OneFlow 기존 backlog query, cycle assignment PATCH, detail drawer/page route, duplicate/move contracts 위에 자체 `BacklogItemActions` 메뉴를 신규 작성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components, viewer read-only guard, Playwright mobile screenshot으로 검증 |
| UI-first cycle item actions surface | `docs/plane-poc-reverse-spec/`의 cycle/sprint item row action, contextual menu, read-only action availability 관찰 | `plane/apps/**`, `plane/packages/**` | 반복/스프린트 행의 secondary actions는 목록을 흐트러뜨리지 않고 row action menu에서 편집, 이동/열기, 분석, 위험 작업을 제공해야 함 | OneFlow 기존 cycles API와 권한 계약을 유지하면서 자체 `CycleItemActions` 메뉴를 신규 작성. Plane DOM/CSS/카피/에셋/패키지 없이 lucide icons, OneFlow tokens, 기존 rollover/delete/burndown hooks, 390px Playwright QA로 독립 구현 |
| UI-first module item actions surface | `docs/plane-poc-reverse-spec/`의 module/feature item row action, contextual menu, read-only action availability 관찰 | `plane/apps/**`, `plane/packages/**` | 기능 그룹/모듈 행의 secondary actions는 목록을 흐트러뜨리지 않고 row action menu에서 열기, 참여자 관리, 편집, 위험 작업을 제공해야 함 | OneFlow 기존 modules API와 권한 계약을 유지하면서 자체 `ModuleItemActions` 메뉴를 신규 작성. Plane DOM/CSS/카피/에셋/패키지 없이 lucide icons, OneFlow tokens, 기존 update/delete/member hooks, 390px Playwright QA로 독립 구현 |
| UI-first milestone/release item actions surface | `docs/plane-poc-reverse-spec/`의 release/milestone list, row action, filtered work item navigation, mobile menu/read-only surface 관찰 | `plane/apps/**`, `plane/packages/**` | 마일스톤/릴리스는 기한·진행률만 보여주는 정적 행이 아니라 연결 작업 목록, 편집/삭제, 읽기 전용 cue가 같은 item action 표면에서 정리되어야 함 | OneFlow 기존 milestones/work-package APIs를 유지하면서 `MilestonesPanel` 행 action menu, inline edit, delete confirmation, `milestone_id` work item filter, saved view param을 자체 구현. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components와 기존 owner/read-only 계약으로 구현 |
| UI-first workflow status/type item actions surface | `docs/plane-poc-reverse-spec/`의 settings/workflow row actions, compact menus, read-only cues, mobile density 관찰 | `plane/apps/**`, `plane/packages/**` | 워크플로우 설정 행은 항상 노출된 입력보다 compact action menu로 편집·순서·상태 변경을 스캔하고, viewer는 같은 표면에서 읽기 전용임을 알아야 함 | OneFlow 기존 project statuses/types API와 자체 settings panels를 유지하면서 공통 `InlineActionMenu`와 status/type row IA를 신규 작성. Plane 소스/DOM/CSS/카피/에셋 없이 OneFlow token/lucide/components와 기존 owner/viewer 계약으로 구현 |
| UI-first developer security/access token surface | `docs/plane-poc-reverse-spec/`의 developer/API token/webhook/security surface 요구와 RSP-012 backlog 관찰 | `plane/apps/**`, `plane/packages/**` | 개발자 설정은 장식용 버튼이 아니라 토큰 생성, 일회성 secret 표시, 목록, 폐기, 만료, API 인증까지 사용 가능한 단위여야 함 | OneFlow 자체 `/me/access-tokens` API, `personal_access_tokens` 테이블, Bearer auth dependency, 개인 설정 panel을 신규 구현. Plane 소스/DOM/CSS/카피/에셋/패키지 없이 SHA-256 hash 저장, prefix 표시, revoke/expire guard, Playwright mobile QA와 pytest 인증 회귀로 독립 검증 |
| UI-first webhook delivery/security surface | `docs/plane-poc-reverse-spec/`의 developer webhook 설정, event subscription, delivery audit/retry, security 요구와 RSP-012 backlog 관찰 | `plane/apps/**`, `plane/packages/**` | Webhook 설정은 endpoint와 event를 관리하고, signing secret을 안전하게 발급하며, 실제 도메인 이벤트 전달 결과를 감사·재시도할 수 있어야 함 | OneFlow 자체 endpoint/delivery 모델, HMAC 파생 secret, HTTPS allowlist/공인 IP 검증, work package event 배선, admin settings surface를 신규 구현. Plane 소스/DOM/CSS/카피/에셋/패키지 없이 OneFlow route/token/lucide와 기존 admin/authz 계약을 사용하고 pytest·Playwright·migration smoke로 독립 검증 |
| UI-122 Cycle scope analytics surface | Reverse Spec의 cycle/sprint 범위 변경, rollover, burndown/velocity 정보구조와 Plane-like compact planning surface 행동 | `plane/apps/**`, `plane/packages/**` | Cycle 범위가 고정 현재 배정이 아니라 진입·이탈과 전달량을 보여주고, 추적할 수 없는 과거는 명확히 구분해야 함 | OneFlow 고유 `cycle_scope_events`, coverage boundary, existing Activity status history와 PlanningSurface/token/lucide만 사용해 구현. Plane 소스·schema·DOM·CSS·chart asset·카피·package를 복사하지 않고 pytest 765, E2E 289+skip1, migration 0094 왕복, clean-room/audit와 desktop/mobile QA로 독립 검증 |
| UI-123 Document inline comments surface | Reverse Spec의 document/page 선택 텍스트 코멘트, thread navigation, activity 정보구조와 read-only/mobile 행동 | `plane/apps/**`, `plane/packages/**` | 문서 검토 코멘트가 본문 위치와 연결되고 답글·일반 코멘트·변경된 앵커 상태를 실제 저장 계약으로 유지해야 함 | OneFlow 고유 nullable anchor UUID/quote, sanitized inert mark, row lock/version CAS와 기존 Tiptap/React Query/token/lucide를 사용해 구현. Plane 소스·schema·DOM·CSS·카피·asset·package를 복사하지 않고 pytest 768, E2E 291+skip1, migration 0095 왕복, clean-room/audit와 desktop/mobile QA로 독립 검증 |
| UI-124 Document comment reactions surface | Reverse Spec의 document/page comment reaction, compact collaboration feedback, read-only/mobile 행동 | `plane/apps/**`, `plane/packages/**` | 본문 스레드와 일반 코멘트가 같은 free-emoji aggregate/toggle 계약을 사용하고 viewer/archive에는 저장 control 없이 기존 반응만 보여야 함 | OneFlow 고유 `document_comment_reactions`, 기존 자체 emoji grammar와 공통 React reaction bar를 사용해 구현. Plane 소스·schema·DOM·CSS·카피·asset·package를 복사하지 않고 migration 0096, pytest 770, focused/full E2E, clean-room/audit와 desktop/mobile QA로 독립 검증 |
| UI-126 Personal overdue reminder cadence | Reverse Spec의 personal notification preferences와 반복 reminder 정보구조, compact settings 상태 행동 | `plane/apps/**`, `plane/packages/**` | 사용자가 기한 알림을 끄거나 첫 1회·3/7/14일 주기를 선택하고, 설정과 일일 배치가 같은 인앱 delivery 계약을 사용해야 함 | OneFlow 고유 migration `0098`, closed cadence API/DB constraint, existing daily advisory-lock job과 Personal Settings surface로 독립 구현. Plane 소스·schema·DOM·CSS·카피·asset·package를 복사하지 않고 pytest 775, E2E 293+skip1와 isolated timing repeat 3/3, migration full round-trip, clean-room/audit와 desktop/mobile QA로 검증 |
| UI-127 Project shared dashboard layouts | Reverse Spec의 dashboard widget customization, project default와 personal override 정보구조, compact source/manage 상태 행동 | `plane/apps/**`, `plane/packages/**` | 프로젝트 소유자가 공통 위젯 구성을 게시하되 각 사용자의 개인 설정을 보존하고, 상속 출처와 충돌을 숨기지 않아야 함 | OneFlow 고유 migration `0099`, personal > shared > built-in resolver, owner-only versioned shared API, archive-exempt personal reset과 Dashboard status/action surface로 독립 구현. Plane 소스·schema·DOM·CSS·카피·asset·package를 복사하지 않고 pytest/OpenAPI/E2E/migration/clean-room/audit와 desktop/mobile QA로 검증 |
| UI-first webhook operations/reliability surface | `docs/plane-poc-reverse-spec/`의 webhook delivery audit/retry 상태와 RSP-012 운영 신뢰성 요구 관찰 | `plane/apps/**`, `plane/packages/**` | 보장은 durable audit와 bounded automatic attempts이며, process crash·동시 worker·일시 실패 뒤에도 운영자가 queued/retrying/dead-letter를 구분·복구할 수 있어야 함 | OneFlow 자체 transactional outbox, immutable event UUID, PostgreSQL `FOR UPDATE SKIP LOCKED` lease와 fencing token, bounded retry/dead-letter state machine, atomic manual retry, admin audit labels를 신규 구현. Pending saturation은 시도 0회의 operator-retryable `dead_letter`가 될 수 있고 실제 전송 시도는 중복될 수 있으므로 consumer는 `x-oneflow-delivery`와 payload `id`(event ID)로 중복 제거해야 한다. Plane 소스/DOM/CSS/카피/에셋/패키지 없이 기존 OneFlow models/routes/tokens와 PostgreSQL 동시성 계약으로 독립 검증 |
## 게이트 실행 증적

### UI-44 personal notes / RSP-014

- 관찰: reverse spec D009의 독립 navigation, title search, add entry, empty CTA와 workspace-home 요약 IA만 기능 요구로 사용했다.
- 금지 경계: `plane/apps/**`, `plane/packages/**`의 source/CSS/DOM/assets/copy를 열람·이식하지 않았다.
- OneFlow 구현: 자체 `/notes` route, plain-text textarea, owner-only PostgreSQL note model/API, version CAS, user advisory transaction lock, pin-first full-set order contract, `/my` independent 3-note summary query를 OneFlow token·lucide·React Query로 작성했다.

- 로컬: `bash scripts/check_cleanroom.sh` → PASS (실행 로그는 `docs/VERIFICATION.md`).
- CI: `.github/workflows/ci.yml`의 `cleanroom` 잡에서 동일 스크립트 실행.
- 게이트 4번(파일명 교집합) 보고 항목 검토: `button.tsx`·`badge.tsx`·`input.tsx` 등 UI 프리미티브 관례명과 `health.py`·`projects.py` 등 도메인 관례명은 이름만 겹칠 뿐이며, 내용은 전부 본 저장소에서 신규 작성(shadcn 스타일 프리미티브는 MIT 패턴의 자체 구현). — filename-overlap-reviewed

## UI-50 Wiki workspace policy

`docs/plane-poc-reverse-spec/` D047에서 관찰한 것은 workspace settings의 Wiki 활성화 행동과 정보구조뿐이다. OneFlow 구현은 기존 자체 문서/검색/첨부 모델 위에 migration 0070 singleton policy, revision CAS admin API, React Query capability cache, OneFlow `SettingsFrame`/token/lucide 기반 UI를 새로 작성했다. Plane source, package, asset, CSS, DOM, wording, schema는 복사하지 않았다. disable 시 데이터 보존과 API enforcement도 OneFlow 제품 경계에 맞춰 독립 설계했다.

스크린샷은 `docs/screenshots/redevelopment/wiki-settings-ui/`에 보존했다. `make cleanroom-check`는 frontend/backend license와 filename overlap attestation까지 PASS했으며 신규 외부 의존성은 없다. — attested-independent-derivation

## UI-51 Data Transfers operations surface

`docs/plane-poc-reverse-spec/` D037-D038에서 관찰한 것은 import/export 작업의 미리보기, 결과 이력, 파일 재다운로드 정보구조다. OneFlow 구현은 기존 자체 CSV/Jira/Linear parser와 LocalStorage 위에 migration 0071, PostgreSQL project-scoped retention lock, membership authz, immutable artifact checksum, 자체 Operations history UI를 독립 설계했다. Plane source, package, asset, CSS, DOM, wording, schema는 복사하지 않았다.

스크린샷은 `docs/screenshots/redevelopment/data-transfer-jobs-ui/`에 보존했다. 신규 외부 의존성은 없으며 `make cleanroom-check`와 dependency audit가 PASS했다. — attested-independent-derivation

## UI-52 Wiki content lifecycle surface

`docs/plane-poc-reverse-spec/` D005/D028-D030과 RSP-009에서 관찰한 것은 Wiki의 shared/private/archived 정보구조와 보관·복원 행동이다. OneFlow 구현은 기존 자체 `ProjectDocument` 모델과 문서 에디터 위에 migration 0072, 작성자 전용 private 가시성, version CAS 보관·복원, 파생 검색·링크·첨부·저장공간 경계를 독립 설계했다. Plane source, package, asset, CSS, DOM, wording, schema는 복사하지 않았다.

스크린샷은 `docs/screenshots/redevelopment/wiki-lifecycle-ui/`에 보존했다. 신규 외부 의존성은 없으며 `make cleanroom-check`와 dependency audit를 동일 게이트로 사용한다. — attested-independent-derivation

## UI-53 AI workspace policy surface

`docs/plane-poc-reverse-spec/` D034에서 관찰한 것은 workspace AI feature settings의 정보구조와 관리자 toggle 행동이다. OneFlow 구현은 기존 자체 secret-free `local-extractive` 작업 요약 위에 migration 0073, 배포 hard ceiling과 DB revision CAS의 이중 게이트, admin authz/audit snapshot, capability cache와 자체 Settings UI를 독립 설계했다. Plane source, package, asset, CSS, DOM, wording, schema는 복사하지 않았다.

스크린샷은 `docs/screenshots/redevelopment/ai-policy-ui/`에 보존했다. 신규 외부 의존성이나 외부 AI credential은 없으며 clean-room/dependency gate로 독립성을 검증한다. — attested-independent-derivation

## UI-54 Initiatives workspace policy surface

`docs/plane-poc-reverse-spec/` D045에서 관찰한 것은 workspace Initiatives feature toggle과 활성화된 surface의 정보구조다. OneFlow 구현은 기존 자체 initiative/project-link 모델 위에 migration 0074, workspace-admin revision CAS, capability cache, API 존재 은닉, search/project rollup 집행과 자체 Settings UI를 독립 설계했다. Plane source, package, asset, CSS, DOM, wording, schema는 복사하지 않았다.

스크린샷은 `docs/screenshots/redevelopment/initiatives-policy-ui/`에 보존했다. 신규 외부 의존성은 없으며 `make cleanroom-check`와 dependency audit가 PASS했다. — attested-independent-derivation

## UI-55 Releases workspace policy surface

`docs/plane-poc-reverse-spec/` D046에서 관찰한 것은 workspace Releases 활성화 toggle과 project-scoped view access 설명뿐이다. OneFlow 구현은 기존 자체 milestone/work-package/saved-view/portfolio 모델 위에 migration 0075, workspace-admin revision CAS, 정책 row write serialization, API redaction/enforcement와 자체 Settings UI를 독립 설계했다. Plane source, package, asset, CSS, DOM, wording, schema는 복사하지 않았다.

스크린샷은 `docs/screenshots/redevelopment/releases-policy-ui/`에 보존했다. 신규 외부 의존성은 없으며 clean-room/dependency gate로 독립성을 검증한다. — attested-independent-derivation

## UI-59 Identity & Sessions surface

`docs/plane-poc-reverse-spec/` D035의 auth mode/issuer와 identity settings 정보구조를 행동 레퍼런스로만 사용했다. OneFlow 구현은 기존 자체 `AuthSession`, dev cookie auth, public auth config와 personal settings primitives 위에 owner-scoped session list/revoke, auth-mode capability, Origin/Referer mutation guard와 responsive states를 독립 설계했다. Plane source, package, asset, CSS, DOM, wording, schema는 복사하지 않았다.

스크린샷은 `docs/screenshots/redevelopment/identity-security-ui/`에 보존했다. 신규 외부 의존성·migration은 없으며 clean-room/dependency gate가 PASS했다. — attested-independent-derivation

## UI-60 Workspace General Settings surface

`docs/plane-poc-reverse-spec/` D007의 workspace name/update와 grouped settings 정보구조를 행동 레퍼런스로만 사용했다. OneFlow 구현은 자체 singleton profile migration, strong revision CAS, admin audit, public identity minimization, React Query cache propagation과 SettingsShell primitives로 독립 설계했다. Plane source, package, asset, CSS, DOM, wording, schema는 복사하지 않았다.

스크린샷은 `docs/screenshots/redevelopment/workspace-general-settings-ui/`에 보존했다. 신규 외부 의존성은 없으며 clean-room/dependency gate가 PASS했다. — attested-independent-derivation

## B-033 OneFlow Precision design system

`docs/plane-poc-reverse-spec/`에서 사용한 입력은 compact workspace shell, consolidated display menu, grouped command search, semantic state chip, full-page/drawer detail, grouped settings, empty/loading/error state의 행동·정보구조·밀도 원칙뿐이다. Plane source, package, asset, DOM, CSS class, exact color, wording, screenshot, logo, or trade dress는 구현 입력으로 사용하지 않았다.

OneFlow 구현은 자체 OKLCH palette, 4/6/8px shape scale, 36/44px density, 52px topbar, 240px rail, border-first elevation, reduced-motion/focus/coarse-pointer contracts와 in-repository React primitives를 새로 작성했다. 기능 아이콘은 기존 `lucide-react`를 사용하며, backend/schema/permission/environment contract와 외부 production dependency는 변경하지 않았다.

`apps/web/src/assets/generated/oneflow-empty-flow.png`는 reference image 없이 built-in `image_gen`으로 생성한 원본 프로젝트 자산이다. Plane mark, UI, logo, source asset를 입력하거나 재현하지 않았고, prompt·치수·해시·접근성·사용 위치는 `docs/ONEFLOW_GENERATED_ASSETS.md`에 보존했다. 기능 아이콘이나 상태 의미에는 사용하지 않는다.

`avatar.tsx`, `controls.tsx`, `icon-button.tsx`, `tooltip.tsx` 등의 일반 파일명은 reference checkout과 겹칠 수 있으나, 모든 구현은 OneFlow의 local API, 토큰, 접근성 계약에 맞춰 독립 작성했다. `make cleanroom-check`의 filename overlap은 이 수동 attestation과 함께 검토한다. — attested-independent-derivation

시각 증적은 `docs/screenshots/design-system/`의 Chromium 1440x960 및 390x844 캡처로 보존한다. 캡처는 OneFlow typed fixture와 API mocking만 사용하고 reference product imagery는 포함하지 않는다.

## 자동 게이트의 한계(PLAN §10)

리터럴 `@plane/` 문자열·라이선스 텍스트·파일명 수준만 자동 탐지된다. 소스를 보며 변수명만 바꿔 옮기는 이식은 자동으로 잡히지 않으므로, PR 설명의 수동 확인 체크박스("소스 파일을 열어 보며 옮겨 적지 않았음")가 이중 방어선이다.

라이선스 스캔의 범위: 게이트 2번은 `apps/web`의 production 의존성만, 3번은 `apps/api` 백엔드만 자동 스캔한다. 프론트 devDependencies(vitest·playwright·oxlint·typescript 등)와 `packages/shared`(openapi-typescript)는 자동 스캔 대상에서 제외되지만, 전수 수동 확인 결과 모두 MIT/Apache-2.0(카피레프트 0건)임을 확인했다(THIRD-PARTY-NOTICES.md). GPL/AGPL/SSPL·`@plane/*`·`@tiptap-pro`는 전 트리에서 0건.

## UI-61 Reference-Composition Global Shell

`docs/plane-poc-reverse-spec/` D001과 component pattern에서 사용한 입력은 전체 폭 topbar, narrow app rail, contextual sidebar, central content frame이라는 행동·정보구조뿐이다. 사용자 참조 이미지는 레이아웃 관계와 정보 밀도 확인에만 사용했다.

OneFlow 구현은 기존 `AppShell`, workspace profile query, project membership write gate, Wiki/AI capability, React Router route와 자체 OKLCH token을 사용해 독립 작성했다. Plane source, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, branding은 복사하지 않았다. 신규 dependency/API/DB/schema/environment 변경은 없다. — attested-independent-derivation

## UI-62 Central Workspace Home Composition

`docs/plane-poc-reverse-spec/` D001과 사용자 참조 화면에서 사용한 입력은 AI/status, quick links, recents, personal notes로 이어지는 정보 우선순위뿐이다. OneFlow 구현은 기존 자체 `/me/work`, projects, notifications, time entries, personal notes, AI capability 데이터와 route를 재배치해 독립 작성했다.

Plane source, package, asset, CSS, DOM hierarchy, exact spacing/colors, wording, onboarding content는 복사하지 않았다. 신규 dependency/API/DB/schema/environment 변경은 없다. — attested-independent-derivation

## UI-63 Project Directory Composition

`docs/plane-poc-reverse-spec/` D002에서 사용한 입력은 project card/list discovery, compact toolbar, search/sort/filter/add 행동뿐이다. OneFlow 구현은 기존 자체 project rollup, health, initiative, create API와 local display preference를 사용해 card/list surface를 독립 작성했다.

Plane cover image, source, package, asset, CSS, DOM hierarchy, exact visual tokens, wording, branding은 복사하지 않았다. OneFlow 계약에 없는 lead/cover는 만들지 않았고 신규 dependency/API/DB/schema/environment 변경은 없다. — attested-independent-derivation

## UI-64 Project Work Items Composition

`docs/plane-poc-reverse-spec/` D003에서 사용한 입력은 work-item title/count, view switching, filter/display/analytics/create controls와 dense list의 행동·정보구조뿐이다. OneFlow 구현은 기존 자체 React Router routes, URL query state, saved filters, CSV import/export, project membership permission과 composer를 재배치해 독립 작성했다.

Plane source, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, icons, branding은 복사하지 않았다. 신규 dependency/API/DB/schema/environment 변경은 없으며 `bash scripts/check_cleanroom.sh`가 PASS했다. — attested-independent-derivation

## UI-65 Detail Activity Taxonomy

`docs/plane-poc-reverse-spec/` D017-D023/S020/RSP-005에서 사용한 입력은 activity taxonomy와 detail feed 정보구조뿐이다. OneFlow 구현은 기존 자체 activity action/field API, comment threads, reactions, mentions, drawer/full-page shared panel과 local tokens로 독립 작성했다.

Plane source, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, icons, branding은 복사하지 않았다. 신규 dependency/API/DB/schema/environment 변경은 없으며 clean-room gate가 PASS했다. — attested-independent-derivation

## UI-66 Detail Properties

`docs/plane-poc-reverse-spec/` D017-D023/S018-S019/S023의 inline property entry와 collapsible properties 행동만 사용했다. OneFlow의 기존 PATCH/version rollback, select controls, permission gate와 local tokens로 독립 작성했으며 Plane source/package/asset/CSS/DOM/wording은 복사하지 않았다. — attested-independent-derivation

## UI-67 Work Items State Workflow

`docs/plane-poc-reverse-spec/`의 distinct empty/loading/error/skeleton 상태 원칙만 사용했다. OneFlow의 기존 work-item query, saved-view reset, composer route, membership write gate와 자체 state primitives로 true/filtered/viewer empty workflow를 독립 작성했으며 Plane source/package/asset/CSS/DOM/wording은 복사하지 않았다. — attested-independent-derivation

## UI-68 Wiki Central Composition

`docs/plane-poc-reverse-spec/` D005/D028-D030의 Wiki rail, shared/private/archived lifecycle, compact page list 행동·정보구조만 사용했다. OneFlow의 기존 workspace capability, project routes, document visibility/archive API, tree/search/create controls와 자체 shell tokens로 독립 작성했으며 Plane source/package/asset/CSS/DOM/wording은 복사하지 않았다. — attested-independent-derivation

## UI-69 AI Central Composition

`docs/plane-poc-reverse-spec/` D034와 사용자 참조 화면에서 사용한 입력은 AI를 독립 workspace surface로 두는 정보구조와 compact navigation 관계뿐이다. OneFlow 구현은 기존 자체 capability, `/me/work`, work-item detail summary API, permission-aware settings route와 local design tokens를 사용해 독립 작성했다.

Plane source, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, prompt UI, branding은 복사하지 않았다. 실제 backend 계약이 없는 chat/composer는 만들지 않았고 신규 dependency/API/DB/schema/environment 변경은 없다. — attested-independent-derivation

## UI-70 Settings Central Composition

`docs/plane-poc-reverse-spec/` D007/D031-D048과 사용자 참조 화면에서 사용한 입력은 Settings를 독립 app rail/context surface로 구성하고 설정 범주를 그룹화하는 정보구조뿐이다. OneFlow 구현은 기존 자체 personal/admin routes, admin permission gate, workspace policy forms, shell tokens와 responsive drawer를 재배치해 독립 작성했다.

Plane source, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, icons, branding은 복사하지 않았다. 신규 dependency/API/DB/schema/environment 변경은 없다. — attested-independent-derivation

## UI-71 Shell Route State

UI-61~UI-70에서 독립 구현한 OneFlow global rail의 route-state 일관성 보정이다. reference source/package/asset/CSS/DOM을 새 입력으로 사용하지 않았으며 OneFlow 자체 React Router pathname과 app context 규칙만 사용했다. — attested-independent-derivation

## UI-72 Workspace Home Widgets

`docs/plane-poc-reverse-spec/` D001/RSP-013과 사용자 참조 화면에서 사용한 입력은 workspace home의 widget management 행동과 quick links/recents/stickies 정보구조뿐이다. OneFlow 구현은 기존 자체 AI capability, work/project/notification/note data, Radix menu primitive와 versioned browser preference로 독립 작성했다.

Plane source, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, widget schema, branding은 복사하지 않았다. 신규 dependency/API/DB/schema/environment 변경은 없다. — attested-independent-derivation

## UI-73 Projects Sidebar Hierarchy

`docs/plane-poc-reverse-spec/` D001-D003과 사용자 참조 화면에서 사용한 입력은 개인 진입점, workspace 진입점, 보조 메뉴, project-scoped navigation을 구분하는 정보구조와 disclosure 행동뿐이다. OneFlow 구현은 기존 자체 React Router route, Customers/Initiatives capability, project membership permission, responsive shell token으로 독립 작성했다.

Plane source, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, icons, branding은 복사하지 않았다. 신규 dependency/API/DB/schema/environment 변경은 없다. — attested-independent-derivation

## UI-74 Topbar Context Navigation

`docs/plane-poc-reverse-spec/` D001-D003/S017에서 사용한 입력은 workspace/project scope와 current surface를 구분하는 compact breadcrumb 정보구조뿐이다. OneFlow 구현은 기존 자체 React Router pathname/query, project/workspace query와 canonical routes로 독립 작성했다.

Plane source, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, project menu behavior, branding은 복사하지 않았다. 신규 dependency/API/DB/schema/environment 변경은 없다. — attested-independent-derivation

## UI-75 Global App Contexts + Wiki Home

`docs/plane-poc-reverse-spec/` D005-D007/D028-D030에서 사용한 입력은 Wiki가 app rail의 독립 앱이고 Projects/Wiki/AI/Settings가 서로 다른 contextual navigation을 가지며 Wiki가 shared/private/archived 범위를 제공한다는 행동·정보구조뿐이다. OneFlow 구현은 기존 자체 workspace capability, project membership, document visibility/archive schema와 React Router를 사용하고 workspace document read endpoint를 독립 설계했다.

Plane source, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, icons, branding은 복사하지 않았다. membership 및 document visibility를 집행하는 OneFlow 고유 workspace document read API를 추가했으며 신규 dependency/DB/schema/environment 변경은 없다. — attested-independent-derivation

## UI-76 Sidebar Personalization

`docs/plane-poc-reverse-spec/` D001-D003과 사용자 참조 화면에서 사용한 입력은 desktop context sidebar collapse/expand와 사용자별 navigation customization 행동뿐이다. OneFlow 구현은 자체 global rail/context sidebar 구조, React state, versioned browser storage, focus lifecycle과 existing route/capability 계약으로 독립 작성했다.

Plane source, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, preference schema, icons, branding은 복사하지 않았다. 신규 dependency/API/DB/schema/environment 변경은 없다. — attested-independent-derivation

## UI-77 Floating Shell Frame + Quick Tools

사용자 참조 화면과 `docs/plane-poc-reverse-spec/` D001-D003에서 사용한 입력은 topbar/global rail이 하나의 outer chrome처럼 보이고 central work surface가 떠 있으며 우측 하단 도구가 세로로 확장된다는 시각 구성·상호작용뿐이다. OneFlow 구현은 자체 shell tokens, existing routes, `useCanWrite` permission gate, responsive frame와 focus lifecycle로 독립 작성했다.

Plane source, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, dock actions, icons, branding은 복사하지 않았다. 신규 dependency/API/DB/schema/environment 변경은 없다. — attested-independent-derivation

## UI-78 Quick Notes Dock + Sticky Notes

사용자 참조 화면과 `docs/plane-poc-reverse-spec/` D001/RSP-001에서 사용한 입력은 우측 하단의 접히는 개인 메모 도구, sticky-note grid, inline editing과 색상·서식 행동뿐이다. OneFlow 구현은 자체 personal-note API, 사용자 advisory lock, 낙관적 version 계약, React Query cache와 shell collision observer를 사용해 독립 설계했다.

Plane source, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, note schema, icons, branding은 복사하지 않았다. OneFlow 고유 color와 사용자별 빈 메모 무결성 migration을 추가했으며 신규 dependency/environment 변경은 없다. — attested-independent-derivation

## UI-79 Frame Context Header + Workspace Popover

사용자 참조 화면과 `docs/plane-poc-reverse-spec/` D001에서 사용한 입력은 global brand chevron, floating frame 내부 context bar, collapsed-sidebar toggle slot, workspace/account popover의 행동·정보구조뿐이다. OneFlow 구현은 자체 React Router context, persisted sidebar preference, workspace profile/me/logout API, admin user directory route와 shell tokens를 사용해 독립 작성했다.

Plane source, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, workspace menu schema, icons, branding은 복사하지 않았다. 현재 제품/API에 없는 create-workspace와 workspace invitation lifecycle은 구현하지 않았고 신규 API/DB/schema/environment/dependency 변경은 없다. — attested-independent-derivation

## UI-101 Topbar Functional Help

`docs/plane-poc-reverse-spec/` S007에서 사용한 입력은 topbar Help icon이 현재 route 위에 transient menu를 연다는 행동과 documentation/support/shortcut 범주의 정보구조뿐이다. OneFlow 구현은 기존 자체 Wiki capability, `/wiki`, `/status`, command-palette config/shortcut guard, overlay registry와 설치된 Radix primitives를 사용해 독립 작성했다.

Plane source, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, support/sales/forum/changelog/version destination, icons 또는 branding은 복사하지 않았다. OneFlow에 실제 계약이 없는 외부 action은 노출하지 않았고 신규 dependency/API/DB/schema/environment/settings UI 변경은 없다. — attested-independent-derivation

## UI-102 Quick Dock Height-fold Correction

Authenticated live inspection에서 사용한 입력은 bottom-anchored dock이 contained actual height로 펼쳐지고 접히며, persistent trigger의 현재 note/X 상태와 300ms half-turn이 layout transition 시작과 함께 바뀐다는 visible behavior뿐이다. OneFlow 구현은 기존 자체 four-phase state, WAAPI interruption snapshot, Personal Notes API, collision observer, focus lifecycle, Lucide icons와 shell tokens로 독립 작성했다.

Plane source, package, asset, SVG path, CSS, DOM hierarchy, exact color, wording, animation implementation 또는 branding은 복사하지 않았다. UI-only correction이며 신규 dependency/API/DB/schema/environment/settings UI 변경은 없다. — attested-independent-derivation

## UI-103 Functional Get Started

`docs/plane-poc-reverse-spec/` S005에서 사용한 입력은 topbar의 compact onboarding entry와 internal route라는 visible behavior·information category뿐이다. OneFlow 구현은 기존 자체 project directory, workspace work-item search, current user/admin directory query, React Router와 shell tokens로 완료 상태와 실제 다음 동작을 독립 설계했다.

Plane wording, checklist taxonomy, source, package, asset, CSS, DOM hierarchy, exact dimensions/colors, animation, icons 또는 branding은 복사하지 않았다. OneFlow의 현재 권한과 데이터만 사용하며 신규 dependency/API/DB/schema/environment/settings UI 변경은 없다. — attested-independent-derivation

## UI-105 Functional Login Experience

사용자 제공 OneFlow 로그인 시안에서 사용한 입력은 desktop two-column brand/auth composition, raised authentication panel, compact mobile auth focus와 밝고 협업적인 정서뿐이다. OneFlow 구현은 기존 자체 `auth/config`, passwordless dev-session login, identity-bound cache reset, React Router redirect 계약과 local design tokens로 독립 작성했다. 배경은 시안 원본을 편집하거나 추출하지 않고 built-in image generation으로 새로 만든 paper-cut journey illustration이며, 프로젝트용 JPEG로 최적화했다.

참조 시안의 source, asset, logo path, CSS, DOM hierarchy, exact dimensions/colors, wording, password/provider control 또는 branding은 복사하지 않았다. 서버 계약이 없는 password, Google/Microsoft, password reset, account creation control은 dead UI로 만들지 않았고, OIDC mode는 현재 backend의 명시적 501 경계를 사용자에게 안내한다. 신규 API/DB/schema/environment/settings UI/dependency 변경은 없다. — attested-independent-derivation

## UI-106 Workspace Column Ordering

`docs/plane-poc-reverse-spec/` D004/S009/S010/S014에서 사용한 입력은 Workspace Views의 Display surface가 표시 열을 사용자별 view state로 관리한다는 행동·정보구조뿐이다. OneFlow 구현은 기존 자체 URL presentation state, private saved-view create/PATCH/reapply 계약, React Table rendering, Radix menu/dialog primitives와 Lucide icons로 독립 작성했다.

Plane source, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, ordering implementation, icons 또는 branding은 복사하지 않았다. 신규 dependency/API/DB/schema/environment/settings UI 변경과 이연 항목은 없다. — attested-independent-derivation

## UI-107 Project Directory User Preferences

`docs/plane-poc-reverse-spec/` D004/S009-S015에서 사용한 입력은 프로젝트 탐색 화면의 표시 선택이 개인 보기 상태로 유지된다는 행동 범주뿐이다. OneFlow 구현은 기존 자체 Project Directory control과 localStorage fallback, FastAPI authentication, PostgreSQL user identity, React Query cache를 사용해 계정별 hydration·안전한 legacy 승격·직렬 저장·실패 재시도를 독립 설계했다.

Plane source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, preference key 또는 branding은 복사하지 않았다. OneFlow 고유 사용자 preference API와 migration `0081`을 추가했으며 신규 dependency/environment/settings UI 변경과 기능 이연 항목은 없다. — attested-independent-derivation

## UI-108 Project Health History

OpenProject의 project lifecycle/status history 범주와 `docs/plane-poc-reverse-spec/`의 compact Overview 정보구조에서 사용한 입력은 상태 변화가 프로젝트 문맥 안에서 추적 가능해야 한다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 owner-only health transition, project membership, archive write guard, React Query cache와 local design tokens를 사용해 append-only report history와 Overview timeline을 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, timeline implementation, icons 또는 branding은 복사하지 않았다. OneFlow 고유 migration `0082`, member-only bounded API, no-op/concurrency/deleted-author 계약을 추가했으며 신규 dependency/environment/settings UI 변경은 없다. Project Phases는 별도 기능형 surface로 유지한다. — attested-independent-derivation

## UI-112 Project Phase Gates

OpenProject 공식 사용자·관리자 문서에서 사용한 입력은 gate가 phase 시작·종료 경계에 붙는 선택형 checkpoint이며 날짜가 phase boundary에서 파생된다는 공개 제품 행동뿐이다. OneFlow 구현은 기존 자체 fixed phase vocabulary, owner-only optimistic PATCH, archive row lock, React Query cache와 local Settings/Overview tokens를 사용해 독립 설계했다.

OpenProject/Plane source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, gate name 또는 icon implementation은 복사하지 않았다. OneFlow 고유 gate vocabulary와 migration `0087`을 추가했으며 신규 dependency/environment 변경은 없다. Working-day 자동 재스케줄과 workspace custom phase definition 관리는 구현하지 않고 별도 후속 surface로 유지한다. — attested-independent-derivation

## UI-113 Project Phase Working-day Scheduling

OpenProject 공식 lifecycle 문서에서 사용한 입력은 앞 단계 종료일 변경 시 후속 단계가 다음 근무일에 시작하고 기존 기간을 유지한다는 공개 제품 행동뿐이다. OneFlow 구현은 기존 고정 단계 어휘, owner-only optimistic PATCH, project archive row lock, PostgreSQL transaction과 React Query cache를 사용해 월-금 계산과 후속 단계 연쇄 이동을 독립 설계했다.

OpenProject/Plane source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, 일정 계산 구현 또는 branding은 복사하지 않았다. 신규 dependency, migration, environment, permission contract 변경은 없다. 공휴일·사용자 정의 근무일, 단계 활성화 전환 재배치와 workspace custom phase definition 관리는 후속 기능형 surface로 유지한다. — attested-independent-derivation

## UI-114 Workspace Working Calendar

OpenProject의 공개 working-time/calendar 제품 범주에서 사용한 입력은 조직이 근무 요일과 휴일을 설정하고 일정 계산이 같은 유효 달력을 사용한다는 공개 행동뿐이다. OneFlow 구현은 자체 singleton workspace profile revision, admin authorization, PostgreSQL JSONB constraints, project-phase transaction, React Query cache와 Settings design tokens를 사용해 독립 설계했다.

OpenProject/Plane source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, calendar implementation 또는 branding은 복사하지 않았다. OneFlow 고유 migration `0088`, revisioned read/write API, closed weekday validation과 holiday-aware scheduler를 추가했으며 신규 dependency/environment 변경은 없다. Phase 활성화 전환 재배치와 workspace custom phase definition 관리는 후속 lifecycle surface로 유지한다. — attested-independent-derivation

## UI-115 Project Phase Activation Scheduling

OpenProject의 공개 project lifecycle/working-time 제품 범주에서 사용한 입력은 저장된 단계 일정이 활성화될 때 이전 단계와 조직 근무일을 기준으로 일관되게 배치돼야 한다는 공개 행동뿐이다. OneFlow 구현은 자체 fixed phase vocabulary, revisioned workspace calendar, owner-only optimistic PATCH, project/calendar row lock, React Query cache와 Settings tokens로 활성화 전환·기간 보존·후속 연쇄·부분 일정 보존을 독립 설계했다.

OpenProject/Plane source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, 일정 계산 구현 또는 branding은 복사하지 않았다. 신규 dependency, route, migration, environment 또는 permission contract 변경은 없다. Workspace custom phase definition administration만 별도 후속 surface로 유지한다. — attested-independent-derivation

## UI-116 Workspace Project Phase Definition Administration

OpenProject의 공개 project lifecycle administration 범주에서 사용한 입력은 조직이 단계의 표시명·색상·순서를 관리하고 프로젝트 전반이 같은 단계 어휘와 순서를 사용한다는 공개 제품 행동뿐이다. OneFlow 구현은 자체 안정 키 4개, singleton Workspace revision, admin authorization, PostgreSQL JSONB, owner-only project phase transaction, React Query cache와 기존 Settings tokens를 사용해 독립 설계했다.

OpenProject/Plane source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, 단계 정의 또는 정렬 구현, icons 및 branding은 복사하지 않았다. OneFlow 고유 migration `0089`, exact-key/name/color validation, atomic ETag CAS와 project scheduler consumption을 추가했으며 신규 dependency/environment 변경은 없다. 안정 키나 단계 수를 바꾸는 동적 workflow schema는 별도 기능형 surface로 유지한다. — attested-independent-derivation

## UI-117 Dynamic Workspace Project Phase Schema

OpenProject의 공개 project lifecycle administration 범주에서 사용한 입력은 조직이 수명주기 단계를 추가·비활성화하고 기존 프로젝트 기록을 보존해야 한다는 제품 행동뿐이다. OneFlow 구현은 UI-116의 자체 Workspace revision, built-in 안정 키, per-project optimistic row, 근무 일정 scheduler와 Settings tokens를 확장해 서버 생성 custom key, lazy adoption, retire/restore와 무손실 downgrade guard를 독립 설계했다.

OpenProject/Plane source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, key 형식, retire 구현, icons 또는 branding은 복사하지 않았다. OneFlow 고유 migration `0090`, bounded revisioned definition contract, project-data preservation과 race 회귀 검증을 추가했으며 신규 dependency/environment 변경은 없다. — attested-independent-derivation

## UI-118 Initiative Ownership Continuity

Plane/OpenProject의 공개 portfolio/initiative 제품 범주에서 사용한 입력은 전략 묶음의 소유권이 구성원 이탈 뒤에도 안전하게 인계되고 프로젝트 접근 경계를 넘지 않아야 한다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 Initiative visibility, connected-project membership, nullable owner, PostgreSQL transaction과 React Query 카드 surface를 사용해 safe candidate transfer와 orphan claim을 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, ownership UI 구현, icons 또는 branding은 복사하지 않았다. OneFlow 고유 candidate scope, row-lock single-winner, inactive owner recovery와 error/retry E2E 계약을 추가했으며 신규 migration, dependency, environment 또는 settings UI 변경은 없다. — attested-independent-derivation

## UI-119 Initiative Work Item Scope / Detail

Plane/OpenProject의 공개 portfolio/initiative 제품 범주와 `docs/plane-poc-reverse-spec/`의 compact detail·work-item 탐색 정보구조에서 사용한 입력은 전략 묶음이 프로젝트 전체 집계뿐 아니라 명시적인 실행 작업 범위를 가져야 한다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 Initiative visibility/ownership, connected-project membership, Work Package schema, PostgreSQL 복합 FK, React Query와 Radix Sheet를 사용해 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, work-item picker/detail 구현, icons 또는 branding은 복사하지 않았다. OneFlow 고유 migration `0091`, connected-project constrained relation, owner-only row-locked write, member-visible bounded read와 hidden-count leak guard를 추가했으며 신규 dependency, environment 또는 settings UI 변경은 없다. Initiative-level notifications는 별도 기능형 surface로 유지한다. — attested-independent-derivation

## UI-120 Initiative Subscriptions / Notifications

Plane/OpenProject의 공개 portfolio/initiative subscription 제품 범주와 `docs/plane-poc-reverse-spec/`의 compact detail·inbox 정보구조에서 사용한 입력은 사용자가 전략 묶음을 구독하고 관련 변경 알림을 현재 접근 권한 안에서 받아야 한다는 공개 제품 행동뿐이다. OneFlow 구현은 자체 Initiative visibility, connected-project membership, notification preference/inbox, PostgreSQL transaction과 React Query detail surface를 사용해 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, subscription/fan-out/inbox 구현, icons 또는 branding은 복사하지 않았다. OneFlow 고유 migration `0092`, self-service durable subscription, actor·active-user·current-visibility·preference fan-out guard와 direct initiative target을 추가했으며 신규 dependency 또는 environment 변경은 없다. 설정 UI에는 개인 이니셔티브 알림 토글만 추가했고 외부 SMTP/email delivery는 별도 transport surface로 유지한다. — attested-independent-derivation

## UI-110F Login Fidelity Closure

사용자 제공 `docs/oneflow-login.png`에서 사용한 입력은 compact two-column 비율, 부드러운 수채화 여백, 연결된 ribbon identity, 선명한 floating work card와 곡선을 따라 흐르는 collaboration cue라는 시각적 요구뿐이다. OneFlow 구현은 기존 자체 생성 수채화 asset, semantic React markup, 공용 brand SVG, CSS motion/reduced-motion 계약과 Playwright 회귀 테스트를 사용해 독립 보정했다.

참조 이미지의 pixel, logo path, source asset, CSS, DOM hierarchy, exact dimensions/colors, typography, avatar, wording 또는 vendor branding은 복사하지 않았다. 공용 마크는 OneFlow용 단일 closed ribbon silhouette과 독립 gradient/depth path로 새로 작성했고, 비교 PNG는 QA 증빙일 뿐 runtime asset으로 사용하지 않는다. 신규 API, DB/schema, environment, dependency, permission 또는 settings UI 변경은 없다. — attested-independent-derivation

## UI-121 Intake Decision History

OpenProject의 공개 request/intake audit 제품 범주와 `docs/plane-poc-reverse-spec/`의 compact disclosure·activity 정보구조에서 사용한 입력은 각 판정이 현재 결과만 덮어쓰지 않고 권한 있는 사용자가 상태 전이와 사유를 추적할 수 있어야 한다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 Intake owner/member visibility, 조건부 triage transaction, Work Package 생성·알림 계약, React Query와 local design tokens를 사용해 append-only 결정 이력과 지연 조회 타임라인을 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, audit/timeline 구현, icons 또는 branding은 복사하지 않았다. OneFlow 고유 migration `0093`, 성공 판정과 동일 transaction의 append, bounded existence-hiding read, actor deletion fallback과 responsive disclosure를 추가했으며 신규 dependency, environment 또는 settings UI 변경은 없다. — attested-independent-derivation

## UI-123 Document Inline Comments

`docs/plane-poc-reverse-spec/`의 document/page collaboration 관찰에서 사용한 입력은 선택한 본문과 코멘트 스레드를 연결하고, 답글·일반 코멘트·변경된 위치를 하나의 검토 surface에서 구분한다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 Project Document visibility/version, plain-text comment, nh3 sanitizer, Tiptap editor, PostgreSQL transaction과 React Query cache를 사용해 독립 설계했다.

Plane source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, inline mark/thread 구현, icons 또는 branding은 복사하지 않았다. OneFlow 고유 migration `0095`, nullable UUID/quote anchor, sanitized inert span, atomic first-comment write, reply validation과 changed-anchor fallback을 추가했다. 신규 환경변수나 설정 UI 변경은 없으며, `@tiptap/core`는 이미 사용 중인 editor stack의 직접 import를 명시한 dependency다. — attested-independent-derivation

## UI-124 Document Comment Reactions

`docs/plane-poc-reverse-spec/`의 document collaboration 관찰에서 사용한 입력은 코멘트 행에 compact reaction aggregate와 빠른 피드백을 배치하고, 읽기 전용 사용자는 기존 집계만 확인한다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 Work Item free-emoji grammar의 제품 계약을 재사용하되 Document comment 전용 관계, 문서 visibility와 writer/archive gate, React Query cache와 OneFlow token/lucide component로 독립 설계했다.

Plane source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, reaction implementation, icons 또는 branding은 복사하지 않았다. OneFlow 고유 migration `0096`, comment/user cascade, idempotent writer toggle, member-scoped deterministic aggregate와 inline/general 공통 reaction bar를 추가했다. 신규 환경변수, dependency 또는 설정 UI 변경은 없다. Document mention notification은 first-class Inbox document target이 필요한 별도 기능이며 이번 surface에 장식용 control로 추가하지 않았다. — attested-independent-derivation

## UI-125 Document Comment Mentions

`docs/plane-poc-reverse-spec/`의 document collaboration 및 Inbox 관찰에서 사용한 입력은 코멘트 작성 중 현재 협업자를 구조화해 지목하고, 알림이 일반 프로젝트 항목이 아니라 실제 Document로 돌아와야 한다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 Project Document visibility, project membership, personal mention preference, notification inbox와 React Query surface를 사용해 독립 설계했다.

Plane source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, mention picker, notification fan-out, target model, icons 또는 branding은 복사하지 않았다. OneFlow 고유 migration `0097`, accepted-member persistence, same-transaction preference-aware delivery, current visibility filtering, same-project composite target integrity, Document title/target와 direct deep link를 추가했다. 신규 환경변수, dependency 또는 설정 UI 변경은 없고 외부 email transport는 별도 인프라 경계다. — attested-independent-derivation

## UI-126 Personal Overdue Reminder Cadence

`docs/plane-poc-reverse-spec/`의 personal notification settings와 reminder 관찰에서 사용한 입력은 사용자가 알림 종류와 반복 주기를 개인적으로 선택하고, 오래 지연된 작업을 동일한 인앱 수신함에서 다시 확인한다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 Notification Settings, due-alert operator job, Work Package assignee/current membership, PostgreSQL transaction과 React Query Personal Settings를 사용해 독립 설계했다.

Plane source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, cadence selector, scheduled query, icons 또는 branding은 복사하지 않았다. OneFlow 고유 migration `0098`, `0/3/7/14` closed vocabulary, once-only no-backfill default, exact elapsed-day recurrence, same-day dedupe/advisory lock과 loading/error/pending/mobile settings states를 추가했다. 신규 dependency·환경변수·권한은 없으며, 설정 UI는 일반 사용자의 개인 preference다. 외부 SMTP/email transport는 운영 자격증명이 필요한 별도 인프라 경계로 유지한다. — attested-independent-derivation

## UI-127 Project Shared Dashboard Layouts

`docs/plane-poc-reverse-spec/`의 dashboard/widget customization 관찰에서 사용한 입력은 프로젝트 공통 위젯 구성을 관리하면서 개인별 표시 설정과 적용 출처를 구분한다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 `dashboard_layouts`, project membership/role, PostgreSQL transaction, React Query Dashboard와 OneFlow token/lucide surface를 사용해 personal > shared > built-in 상속을 독립 설계했다.

Plane source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, widget manager, inheritance/CAS implementation, icons 또는 branding은 복사하지 않았다. OneFlow 고유 migration `0099`, project-owned closed-vocabulary row, owner-only active-project versioned write, archive-exempt personal override/reset, source metadata와 stale draft recovery를 추가했다. 신규 dependency, 환경변수 또는 별도 설정 UI 변경은 없다. — attested-independent-derivation

## UI-128 Import Assignee Account Mapping

Plane/OpenProject의 공개 importer/migration 제품 범주에서 사용한 입력은 외부 tracker의 사용자 identity를 현재 프로젝트 구성원에 명시적으로 연결하고 unresolved identity를 조용히 왜곡하지 않아야 한다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 Jira/Linear CSV parser, Work Package schema, project membership/role, import advisory lock, Data Transfer audit, React Sheet와 local design tokens를 사용해 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, account-matching algorithm, importer UI, icons 또는 branding은 복사하지 않았다. OneFlow 고유 upload-text checksum binding, exact-email suggestion-only policy, explicit member/unassigned decision, commit-time active owner/member row locking, viewer/inactive rejection과 responsive mapping panel을 추가했다. 신규 migration, dependency, environment 또는 별도 Settings UI 변경은 없다. — attested-independent-derivation

## UI-129 File Content Search

`docs/plane-poc-reverse-spec/`의 workspace search와 파일 탐색 관찰에서 사용한 입력은 사용자가 현재 접근 가능한 업로드를 이름과 지원 본문으로 찾고 실제 파일 표면으로 이동한다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 Attachment/LocalStorage, Document visibility, Workspace Wiki policy, unified search, React Query와 Files surface를 사용해 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, file parser/indexer, search UI, icons 또는 branding은 복사하지 않았다. OneFlow 고유 migration `0100`, 512 KiB closed text-family extractor, inline upload indexing, bounded legacy reindex, explicit terminal states와 private Document/Wiki-safe result and count boundary를 추가했다. 신규 dependency, environment 또는 별도 Settings UI 변경은 없으며 OCR/PDF/object-store parser는 지원 capability 없이 구현하지 않았다. — attested-independent-derivation

## UI-149 Initiative Discovery Controls

`docs/plane-poc-reverse-spec/`의 compact view control과 filter 정보구조에서 사용한 입력은 전략 목록을 검색·수명주기·헬스·소유 범위로 좁히고 결정적으로 정렬하며 현재 조건을 URL로 공유한다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 Initiative visibility, exact label API, React Router query state, React Query와 local reporting primitives를 사용해 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, filter implementation, icons 또는 branding은 복사하지 않았다. 검색과 조합 필터는 이미 권한 필터링된 전체 응답만 사용하고, label과 hidden-project 경계는 서버 권한 계약을 그대로 유지한다. 신규 API, migration, dependency, environment, permission 또는 Settings UI 변경은 없다. — attested-independent-derivation

## UI-151 Login Origin Reinspection

이번 보정의 유일한 시각 기준은 사용자가 직접 제공하고 OneFlow 제품 기준으로 승인한 `docs/oneflow-login-origin.png`다. 같은 바이트를 런타임 자산으로 사용해 수채화 배경과 OneFlow 브랜드 lockup을 보존하고, 인증 영역은 기존 OneFlow `auth/config`, dev/OIDC 로그인, assistance request, locale, focus, validation과 safe-next 계약을 수행하는 semantic DOM으로 유지했다. 따라서 UI-110F 당시의 “비교 PNG는 런타임에 사용하지 않는다”는 과거 상태는 UI-151부터 대체된다.

Plane/OpenProject source, package, asset, logo, CSS, DOM, wording 또는 branding은 입력·복사하지 않았다. 기준 자산과 런타임 자산의 SHA-256은 모두 `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`이며, 신규 API, DB/schema, migration, permission, environment, dependency 또는 Settings UI 변경은 없다. — attested-user-owned-oneflow-asset

## UI-155 Login Pixel Audit

UI-155의 유일한 시각 입력도 사용자가 제공하고 OneFlow 제품 자산으로 승인한 `docs/oneflow-login-origin.png`다. 좌측 비주얼과 브랜드 bitmap은 변경하지 않았고, 기능형 인증 DOM의 위치와 OneFlow 아이콘 표현만 diff 수치로 보정했다. Plane/OpenProject source, package, asset, CSS, DOM, branding 또는 wording을 사용하지 않았다. 신규 API, DB/schema, migration, permission, environment, dependency 또는 Settings UI 변경은 없다. — attested-user-owned-oneflow-asset

## UI-160 Login In-App Pixel Convergence

UI-160의 유일한 시각 입력도 사용자가 제공하고 OneFlow 제품 자산으로 승인한 `docs/oneflow-login-origin.png`다. 기준 파일과 runtime 자산의 SHA-256은 모두 `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`이며, 좌측 수채화·브랜드 bitmap은 수정하거나 새로 생성하지 않았다. 변경은 기능형 인증 카드의 scrollbar chrome 제거, 원본 crop 위치 보정과 반응형 회귀 assertion에 한정된다.

Plane/OpenProject source, package, asset, CSS, DOM, exact dimensions/colors, wording 또는 branding을 입력·복사하지 않았다. 신규 API, DB/schema, migration, permission, environment, dependency 또는 Settings UI 변경은 없다. — attested-user-owned-oneflow-asset

## UI-150 Initiative Activity Detail

`docs/plane-poc-reverse-spec/`에서 사용한 입력은 상세 surface가 실제 변경 이력을 actor·요약·시각과 함께 newest-first로 보여주고 추가 이력을 단계적으로 불러온다는 제품 행동뿐이다. OneFlow 구현은 자체 Initiative 모델, 현행 Initiative visibility resolver, FastAPI/SQLAlchemy transaction, React Query infinite query와 기존 detail drawer primitives로 독립 설계했다.

활동 row는 닫힌 event kind와 변경된 field 이름만 저장한다. 연결 프로젝트·작업의 이름, ID, 이전/새 값은 기록하지 않아 현재 권한을 우회하는 과거 payload가 생기지 않는다. 읽을 때마다 현재 Initiative visibility를 다시 적용하며 actor 삭제는 nullable FK로 보존한다. Plane/OpenProject source, API, schema, package, asset, CSS, DOM, wording, icons 또는 branding은 복사하지 않았다. — attested-independent-derivation

## UI-156 Project Schedule Baseline History

OpenProject의 공개 일정 기준선 제품 범주와 `docs/plane-poc-reverse-spec/`의 compact project detail·selector 정보구조에서 사용한 입력은 프로젝트 일정을 이름 있는 시점별 snapshot으로 보존하고 현재 일정과 선택한 과거 시점을 비교한다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 Work Package 일정, 프로젝트 membership/role, PostgreSQL advisory lock, FastAPI/SQLAlchemy와 Project Overview React Query surface를 사용해 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, baseline algorithm, selector/dialog 구현, icons 또는 branding은 복사하지 않았다. OneFlow 고유 migration `0110`, 20개 bounded history, 5,000개 작업 snapshot 상한, 이름 정규화, owner-only active-project write, member read, 선택별 variance와 optimistic delete recovery를 추가했다. 기존 단일 `/schedule-baseline` 계약은 최신 기준선 호환 경로로 보존하며 신규 dependency, environment 또는 Settings UI 변경은 없다. Portfolio 전체 기준선 분석은 별도 surface다. — attested-independent-derivation

## UI-157 Portfolio Schedule Baseline Analytics

OpenProject의 공개 portfolio/baseline 제품 범주와 `docs/plane-poc-reverse-spec/`의 compact report/filter 정보구조에서 사용한 입력은 권한 있는 프로젝트의 최신 일정 기준선 적용 여부와 현재 일정 위험을 같은 비교 surface에서 탐색하고 프로젝트 상세로 이동한다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 Portfolio member scope, UI-156 schedule snapshot, PostgreSQL aggregate, FastAPI/SQLAlchemy와 local Reporting primitives를 사용해 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, baseline aggregation/filter/table 구현, icons 또는 branding은 복사하지 않았다. 집계는 반환된 최대 200개 authorized project ID로 제한하고 Work Package subject/history를 응답하지 않으며, desktop/mobile surface와 Overview deep link를 OneFlow 고유 코드로 구현했다. 신규 migration, dependency, environment, permission 또는 Settings UI 변경은 없다. 여러 과거 기준선 추세는 별도 bounded series 계약이 필요한 후속 분석 surface다. — attested-independent-derivation

## UI-158 Project Schedule Baseline Trend

OpenProject의 공개 일정 기준선 제품 범주와 `docs/plane-poc-reverse-spec/`의 compact history/selection 정보구조에서 사용한 입력은 저장한 여러 일정 시점을 한 surface에서 훑고 선택한 시점의 편차를 상세 확인한다는 제품 행동뿐이다. OneFlow 구현은 UI-156의 자체 snapshot, current Project membership, PostgreSQL aggregate, FastAPI/SQLAlchemy와 Project Overview React Query surface를 사용해 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, trend calculation/chart 구현, icons 또는 branding은 복사하지 않았다. 최대 20개 기준선만 한 aggregate로 현재 일정과 비교하고 subject/history payload를 목록에서 제외했으며, 각 추세 행을 기존 authorized detail query에 연결했다. 신규 migration, dependency, environment, permission 또는 Settings UI 변경은 없다. 임의 과거 범위의 organization-wide 추세는 별도 bounded reporting 계약으로 유지한다. — attested-independent-derivation

## UI-159 Portfolio Recent Baseline Trend

OpenProject의 공개 portfolio/baseline 제품 범주와 `docs/plane-poc-reverse-spec/`의 compact report/view-control 정보구조에서 사용한 입력은 권한 있는 여러 프로젝트의 최근 일정 기준선 변화를 같은 surface에서 비교하고 선택 시 상세 시점으로 이동한다는 제품 행동뿐이다. OneFlow 구현은 UI-156~158의 자체 snapshot과 current ProjectMember scope, PostgreSQL aggregate, FastAPI/SQLAlchemy 및 local Reporting primitives로 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, trend endpoint/chart 구현, icons 또는 branding은 복사하지 않았다. 집계는 반환이 승인된 최대 200개 프로젝트와 프로젝트당 최근 5개 기준선으로 제한하고 Work Package subject나 hidden-project 이력을 응답하지 않는다. 신규 migration, dependency, environment, permission 또는 Settings UI 변경은 없다. 임의 기준일·사용자 지정 기간과 차원/pivot report builder는 별도 bounded 분석 surface로 유지한다. — attested-independent-derivation

## UI-162 Login Origin DPR Closure

UI-162의 유일한 시각 입력은 사용자가 직접 제공하고 OneFlow 제품 자산으로 승인한 `docs/oneflow-login-origin.png`다. 기준 파일과 runtime 1x 자산의 SHA-256은 모두 `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`이다. 고밀도 자산은 이 사용자 소유 원화에 결정적 Lanczos resample만 적용했으며 생성형 재해석, 제3자 로고·asset 사용, 색상 변경 또는 요소 재조합이 없다. 인증 영역은 기존 OneFlow auth API와 semantic DOM을 계속 사용한다.

Plane/OpenProject source, package, asset, logo, CSS, DOM, wording 또는 branding은 입력·복사하지 않았다. 신규 API, DB/schema, migration, permission, environment, dependency 또는 Settings UI 변경은 없다. - attested-user-owned-oneflow-asset

## UI-161 Workspace Branding

`docs/plane-poc-reverse-spec/`와 사용자 캡처에서 사용한 입력은 워크스페이스 identity가 전역 shell과 설정 표면에 일관되게 표시되고 관리자가 로고를 교체한다는 제품 행동뿐이다. OneFlow 구현은 자체 WorkspaceProfile revision, LocalStorage abstraction, FastAPI/SQLAlchemy, React Query cache와 기존 shell primitives로 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, upload 구현, icons 또는 branding은 복사하지 않았다. OneFlow 고유 migration `0111`, bounded static-image validation, admin CAS, blob replacement rollback, live-reference sweep와 이름 기반 fallback을 추가했다. 외부 object store와 임의 theme 편집은 별도 운영·디자인 정책이 필요한 후속 surface다. - attested-independent-derivation

## UI-163 Workspace Integrations Hub

`docs/plane-poc-reverse-spec/`의 설정 정보구조에서 사용한 입력은 워크스페이스 연결 상태를 한 곳에서 훑고 실제 세부 관리 surface로 이동하며, 각 capability의 준비·오류 상태를 독립적으로 보여준다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 Webhook, Data Transfer audit, AI workspace policy, public auth config, React Query와 local Settings primitives로 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, integration card 구현, icons 또는 branding은 복사하지 않았다. 허브는 이미 권한이 적용된 네 OneFlow API의 증명 가능한 값만 표시하고 secret이나 외부 provider 연결 상태를 추정하지 않는다. 신규 API, migration, dependency, environment 또는 permission 변경은 없으며, 외부 adapter는 운영 credential과 callback 검증이 확보되기 전까지 control을 노출하지 않는다. - attested-independent-derivation

## UI-164 Workspace Administration Overview

`docs/plane-poc-reverse-spec/`의 설정 정보구조에서 사용한 입력은 워크스페이스 운영자가 핵심 관리 영역의 현재 상태를 한 곳에서 훑고 실제 세부 설정으로 이동하며, 일부 상태 조회 실패가 전체 관리 동선을 막지 않는다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 WorkspaceProfile, User directory, Invitation, Working Calendar, Project Phase Definition, Capability API와 local Settings primitives로 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, overview 행 구현, icons 또는 branding은 복사하지 않았다. 개요는 이미 권한이 적용된 여섯 OneFlow API의 증명 가능한 값만 표시하고 role/provider 상태를 추정하지 않는다. 신규 API, migration, dependency, environment 또는 permission 변경은 없다. - attested-independent-derivation

## UI-167 Login Interactive Pixel Closure

UI-167의 유일한 시각 입력은 사용자가 직접 제공하고 OneFlow 제품 자산으로 승인한 `docs/oneflow-login-origin.png`다. 전체 화면 bitmap을 runtime overlay로 사용하던 중간 구현을 제거하고, 사용자 프롬프트가 허용한 좌측 story 영역과 OneFlow logo lockup만 결정적 crop/resample 자산으로 분리했다. 우측은 기존 OneFlow auth API와 접근 가능한 semantic DOM을 첫 페인트부터 렌더링한다.

Plane/OpenProject source, package, asset, logo, CSS, DOM, wording 또는 branding은 입력·복사하지 않았다. 신규 API, DB/schema, migration, permission, environment, dependency 또는 Settings UI 변경은 없다. - attested-user-owned-oneflow-asset

## UI-169 Login Functional Pixel Regression

UI-169의 유일한 시각 입력은 사용자가 직접 제공하고 OneFlow 제품 자산으로 승인한 `docs/oneflow-login-origin.png`다. 좌측 story와 1x 브랜드 lockup은 승인 원본의 정확한 crop이며, 신규 `oneflow-login-logo-lockup@2x.png`는 기존 OneFlow 소유 2x 원화에서 같은 좌표를 결정적으로 잘라 만든 고밀도 파생 자산이다. 생성형 재해석, 색상 변경, 형태 재구성 또는 제3자 자산 사용은 없다.

Plane/OpenProject source, package, asset, logo, CSS, DOM, wording 또는 branding은 입력·복사하지 않았다. 인증 화면은 기존 OneFlow auth API와 semantic DOM을 유지하며 신규 API, DB/schema, migration, permission, environment, dependency 또는 Settings UI 변경은 없다. - attested-user-owned-oneflow-asset

## UI-170 Shared Action Menu Keyboard Lifecycle

`docs/plane-poc-reverse-spec/`의 compact action menu 관찰에서 사용한 입력은 작업 메뉴가 열리면 사용 가능한 첫 항목으로 진입하고, 방향키로 이동하며, 외부 클릭과 `Escape`로 예측 가능하게 닫힌다는 제품 행동뿐이다. OneFlow 구현은 기존 자체 `InlineActionMenu`, React state/ref와 local design token을 사용해 상태·작업 타입·자동화 설정 surface의 공통 수명주기를 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, menu implementation, icons 또는 branding은 복사하지 않았다. 비활성 항목을 제외한 `ArrowUp`/`ArrowDown` 순환, `Home`/`End`, `Escape` trigger focus 복귀, `Tab` 자연 이탈과 외부 pointer dismissal을 추가했다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다. - attested-independent-derivation

## UI-171 Milestone Action Menu Convergence

`docs/plane-poc-reverse-spec/`의 compact row action 관찰에서 사용한 입력은 프로젝트 계획 항목의 실제 작업을 한 메뉴에서 실행하고 pointer와 keyboard가 같은 탐색·종료 계약을 공유한다는 제품 행동뿐이다. OneFlow 구현은 UI-170에서 독립 설계한 자체 `InlineActionMenu`와 기존 Milestone API/navigation을 재사용해 별도 메뉴 구현을 제거했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, menu implementation, icons 또는 branding은 복사하지 않았다. 작업 목록 필터 이동, owner 편집·삭제, viewer 권한 cue는 기존 OneFlow 기능을 유지하며 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다. - attested-independent-derivation

## UI-172 Cycle Action Menu Lifecycle

`docs/plane-poc-reverse-spec/`에서 사용한 입력은 viewport 경계 안의 planning-item menu가 pointer와 keyboard에서 같은 진입·탐색·종료 계약을 제공한다는 관찰 가능한 행동뿐이다. OneFlow 구현은 기존 Cycle API, 자체 React menu와 local design token 위에서 first-enabled focus, disabled skip, 방향키 순환, outside dismissal과 trigger 복귀를 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, menu implementation, icons 또는 branding은 복사하지 않았다. 작업 목록 필터, 번다운, owner 편집·완료 사이클 이월·삭제와 viewer read-only 경계를 그대로 유지하며 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다. - attested-independent-derivation

## UI-173 Module Action Menu Lifecycle

`docs/plane-poc-reverse-spec/`에서 사용한 입력은 viewport 경계 안의 planning-item menu가 pointer와 keyboard에서 같은 진입·탐색·종료 계약을 제공한다는 관찰 가능한 행동뿐이다. OneFlow 구현은 자체 React hook과 local design token을 사용해 Module/Cycle의 first-enabled focus, disabled skip, 방향키 순환, Tab/outside dismissal과 trigger 복귀를 하나의 공통 lifecycle로 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, menu implementation, icons 또는 branding은 복사하지 않았다. Module의 작업 목록 필터, 참여자 PUT, owner 편집·삭제 및 viewer read-only 경계를 유지하며 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다. - attested-independent-derivation

## UI-174 Planning Work Item Action Menu Convergence

`docs/plane-poc-reverse-spec/`에서 사용한 입력은 서로 다른 planning layout에서도 work-item action menu가 같은 pointer·keyboard 진입, 탐색, 종료와 trigger 상태 계약을 제공한다는 관찰 가능한 행동뿐이다. OneFlow 구현은 UI-173의 자체 `useFloatingActionMenuLifecycle`, 기존 Backlog React row와 DHTMLX Timeline adapter, local design token을 사용해 first-enabled focus, disabled skip, 방향키 순환, Tab/outside dismissal, Escape focus 복귀와 trigger/menu ARIA를 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, menu implementation, icons 또는 branding은 복사하지 않았다. 기존 상세 drawer, 전체 페이지, 링크 복사, 작업 복제·이동과 viewer read-only 경계를 유지하며 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다. - attested-independent-derivation

## UI-175 Work Item Dropdown Action Convergence

`docs/plane-poc-reverse-spec/`에서 사용한 입력은 작업 항목의 compact dropdown이 현재 항목을 명확히 식별하고 pointer와 keyboard에서 동일한 실제 작업·종료 계약을 제공한다는 관찰 가능한 행동뿐이다. OneFlow 구현은 기존 자체 Radix dropdown primitive, Work Package API, React Query mutation과 local design token을 사용해 Board, List, Tree, Calendar의 중복 action content를 하나의 공통 컴포넌트로 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, menu implementation, icons 또는 branding은 복사하지 않았다. 네 surface의 실제 상세 drawer, 전체 페이지, 링크 복사, 복제, 이동과 owner/viewer 권한 경계를 유지하며 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다. - attested-independent-derivation

## UI-176 Project Sidebar Action Menu Lifecycle

`docs/plane-poc-reverse-spec/`과 사용자 제공 캡처에서 사용한 입력은 프로젝트 sidebar의 compact action menu가 행에 고정되고, pointer와 keyboard에서 같은 열림·탐색·종료 계약 및 짧은 surface motion을 제공한다는 관찰 가능한 행동뿐이다. OneFlow 구현은 기존 자체 Radix dropdown primitive, Project API, local navigation preference와 design token을 사용해 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, menu implementation, icons 또는 branding은 복사하지 않았다. 기존 즐겨찾기 설정, clipboard 복사, 설정 이동, owner 확인 후 프로젝트 보관 mutation을 유지하고 공통 dropdown의 transform-origin 기반 열림·닫힘 motion, reduced-motion 제거와 trigger/menu ARIA 연결을 추가했다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다. - attested-independent-derivation

## UI-177 Navigation Overlay Bidirectional Motion

`docs/plane-poc-reverse-spec/`과 사용자 제공 캡처에서 사용한 입력은 sidebar에서 여는 보조 패널과 navigation customization dialog가 현재 화면 위에 떠서 열리고 닫힐 때 같은 방향성의 짧은 motion, focus containment와 trigger 복귀를 제공한다는 관찰 가능한 행동뿐이다. OneFlow 구현은 기존 자체 sidebar preference, React state/ref, local design token과 CSS animation을 사용해 `opening`/`open`/`closing`/`closed` 수명주기를 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, motion implementation, icons 또는 branding은 복사하지 않았다. 기존 More pin/unpin, navigation visibility/order/drag, project navigation mode/limit persistence와 keyboard/outside dismissal을 유지하고 reduced-motion 즉시 정착을 추가했다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다. - attested-independent-derivation

## UI-178 Shared Sheet Bidirectional Motion

`docs/plane-poc-reverse-spec/`에서 사용한 입력은 우측 상세 surface가 현재 화면 위에서 열리고 닫히며 focus를 가두고 종료 뒤 원래 trigger로 돌아간다는 관찰 가능한 행동뿐이다. OneFlow 구현은 자체 Radix Sheet primitive, React state와 local design token을 사용해 overlay와 panel의 양방향 presence lifecycle을 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, motion implementation, icons 또는 branding은 복사하지 않았다. 작업 상세, 이니셔티브 상세, 알림, CSV 가져오기와 템플릿 상세의 기존 API-backed 상태와 action을 유지하며 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다. - attested-independent-derivation

## UI-179 Workspace Views Shared Modal Motion

`docs/plane-poc-reverse-spec/`에서 사용한 입력은 저장 뷰, 열 순서와 분석 surface가 같은 modal motion, focus containment와 종료 계약을 제공한다는 관찰 가능한 행동뿐이다. OneFlow 구현은 자체 Radix Dialog primitive, React state와 local design token을 사용해 overlay와 content의 양방향 presence lifecycle을 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, motion implementation, icons 또는 branding은 복사하지 않았다. 실제 saved-view CRUD, column order URL/private-view 왕복과 filtered analytics 요청·상태를 유지하며 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다. - attested-independent-derivation

## UI-180 Login In-App Exhaustive Pixel Audit

UI-180의 유일한 시각 입력은 사용자가 직접 제공하고 OneFlow 제품 자산으로 승인한 `docs/oneflow-login-origin.png`다. runtime 전체 원본과 승인 원본의 SHA-256은 모두 `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`이며, story crop `(0,0)-(792,1086)`과 auth logo crop `(1011,100) 205x70`은 승인 원본 대비 pixel MAE `0`이다. 신규 unit test가 전체, story와 logo의 1x/2x 파생 자산 SHA-256을 고정한다.

Plane/OpenProject source, package, asset, logo, CSS, DOM, wording 또는 branding은 입력·복사하지 않았다. 인증 영역은 기존 OneFlow auth API와 semantic DOM을 유지한다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없으며, 외부 OIDC 공급자의 실제 연결만 배포별 credential 경계를 유지한다. - attested-user-owned-oneflow-asset

## UI-181 Project Functional Modal Motion

`docs/plane-poc-reverse-spec/`에서 사용한 입력은 프로젝트 표지와 일정 기준선 같은 기능형 대화상자가 현재 화면 위에 중앙 정렬되고, 열림과 닫힘에 같은 짧은 motion, focus containment와 trigger 복귀를 제공한다는 관찰 가능한 행동뿐이다. OneFlow 구현은 자체 Radix Dialog primitive, 기존 Project/Attachment/Schedule Baseline API, React Query state와 local design token을 사용해 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, modal implementation, icons 또는 branding은 복사하지 않았다. 표지 upload/remove와 기준선 create/delete·409 conflict recovery를 그대로 유지했고, Tailwind 4의 독립 `translate` 속성과 CSS animation transform이 중첩되던 좌표 결함을 공통 modal primitive에서 제거했다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다. - attested-independent-derivation

## UI-182 Login Integer Pixel Convergence

UI-182의 유일한 시각 입력은 사용자가 직접 제공하고 OneFlow 제품 자산으로 승인한 `docs/oneflow-login-origin.png`다. 신규 `oneflow-login-story-reference-667x915.png`와 `oneflow-login-logo-lockup-173x59.png`는 기존 승인 crop을 Lanczos로 결정적으로 축소한 정수 픽셀 파생 자산이며 SHA-256 unit regression으로 고정한다. 생성형 재해석, 로고 형태 재구성, 색상 변경 또는 제3자 자산 사용은 없다.

Plane/OpenProject source, package, asset, logo, CSS, DOM, wording 또는 branding은 입력·복사하지 않았다. 인증 영역은 기존 OneFlow auth API와 semantic DOM을 유지하며 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다. - attested-user-owned-oneflow-asset

## UI-186 Login Pixel Reinspection Closure

UI-186의 유일한 시각 입력은 사용자가 직접 제공하고 OneFlow 제품 자산으로 승인한 `docs/oneflow-login-origin.png`이며, runtime reference와 동일한 SHA-256 `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`을 유지한다. story·logo bitmap을 재생성하거나 제3자 자산으로 대체하지 않고, 승인 crop이 브라우저 합성 단계에서 다시 보간되지 않도록 OneFlow 자체 CSS layout과 `srcset` 선택만 교정했다.

Plane/OpenProject source, package, asset, logo, CSS, DOM, wording 또는 branding은 입력·복사하지 않았다. 인증 영역은 기존 OneFlow semantic DOM과 auth API, 자체 local design token을 유지한다. 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다. - attested-user-owned-oneflow-asset

## UI-185 Work Item Properties Rail IA

`docs/plane-poc-reverse-spec/`에서 사용한 입력은 full-page 작업 상세가 compact label/value 속성 hierarchy, bounded groups, sticky desktop rail, collapse와 dual resize를 제공한다는 S027의 관찰 가능한 정보 구조와 행동뿐이다. OneFlow 구현은 기존 `WorkPackageDetailPanel`, work-package CAS PATCH, capability query, React state/localStorage와 자체 design token/Lucide icon으로 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, component implementation, icons 또는 branding은 복사하지 않았다. 모든 속성 write, 날짜 repair/validation, viewer boundary, loading/error, collapse, resize와 mobile flow를 기존 OneFlow 계약에 유지했고 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다. - attested-independent-derivation

## UI-187 Work Item Linked Content Sections

`docs/plane-poc-reverse-spec/`에서 사용한 입력은 작업 상세의 관련 작업, 문서와 첨부가 compact count/header/row hierarchy와 필요할 때 여는 composer, loading/empty/error recovery를 제공한다는 S027의 관찰 가능한 정보 구조와 행동뿐이다. OneFlow 구현은 기존 relation/document/attachment API hooks, React Query, React state와 자체 design token/Lucide icon으로 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, component implementation, icons 또는 branding은 복사하지 않았다. relation create/delete, document navigation, attachment open/download, viewer boundary와 mobile flow를 기존 OneFlow 계약에 유지했고 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다. - attested-independent-derivation

## UI-188 Work Item Time/Cost Ledger IA

`docs/plane-poc-reverse-spec/`에서 사용한 입력은 작업 상세의 실행 원장이 compact count/summary/row hierarchy와 필요할 때 여는 composer, loading/empty/error recovery를 제공한다는 S027의 관찰 가능한 정보 구조와 행동뿐이다. OneFlow 구현은 기존 time-entry/cost-entry API hooks, React Query, React state와 자체 design token/Lucide icon으로 독립 설계했다.

Plane/OpenProject source, API, database schema, package, asset, CSS, DOM hierarchy, exact dimensions/colors, wording, component implementation, icons 또는 branding은 복사하지 않았다. time/cost create/delete, estimate/spent/remaining, category total, validation, viewer boundary와 mobile flow를 기존 OneFlow 계약에 유지했고 신규 API, DB/schema, migration, permission, environment variable, dependency 또는 Settings storage 변경은 없다. - attested-independent-derivation
