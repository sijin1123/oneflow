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

## 게이트 실행 증적

- 로컬: `bash scripts/check_cleanroom.sh` → PASS (실행 로그는 `docs/VERIFICATION.md`).
- CI: `.github/workflows/ci.yml`의 `cleanroom` 잡에서 동일 스크립트 실행.
- 게이트 4번(파일명 교집합) 보고 항목 검토: `button.tsx`·`badge.tsx`·`input.tsx` 등 UI 프리미티브 관례명과 `health.py`·`projects.py` 등 도메인 관례명은 이름만 겹칠 뿐이며, 내용은 전부 본 저장소에서 신규 작성(shadcn 스타일 프리미티브는 MIT 패턴의 자체 구현). — filename-overlap-reviewed

## 자동 게이트의 한계(PLAN §10)

리터럴 `@plane/` 문자열·라이선스 텍스트·파일명 수준만 자동 탐지된다. 소스를 보며 변수명만 바꿔 옮기는 이식은 자동으로 잡히지 않으므로, PR 설명의 수동 확인 체크박스("소스 파일을 열어 보며 옮겨 적지 않았음")가 이중 방어선이다.
