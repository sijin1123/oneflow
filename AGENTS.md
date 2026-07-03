# OneFlow Agent Instructions

## Product Goal

OneFlow is a company-internal project management system built as a greenfield product.

The product should eventually support:

- Project and issue management
- Schedules, milestones, status tracking, and progress reporting
- Owner and assignee-level work tracking
- Company-specific workflow customization
- Documents, meetings, file storage, reporting, and automation workflows

## Source Boundary

`oneflow/` is the target product workspace. Do not edit `../openproject/AGENTS.md`, `../openproject/CLAUDE.md`, or other upstream reference files unless the user explicitly requests reference-source changes.

Build OneFlow source under this workspace. Treat upstream projects as references only.

## Reference Sources

Use `../openproject/` and `../plane/` as reference sources for comparison. Do not copy their source, schema, assets, or exact UI.

Before implementation, assess:

- Functional fit for Jira/Redmine-like project management
- Data model flexibility for company workflows
- Authentication and permission model
- Reporting/dashboard extensibility
- Frontend customization cost
- Backend customization cost
- Deployment and maintenance complexity
- License and fork maintenance risk

SAP Business One / SAP B1 integration is excluded from OneFlow scope unless the user explicitly reverses that decision.

PostgreSQL deployment follows `../docs/ONEFLOW_POSTGRESQL_DEPLOYMENT_POLICY.md`: local development may use Docker Desktop + Docker Compose, while production PostgreSQL should be externalized to managed PostgreSQL or a dedicated DB server where possible.

UI direction follows `../docs/ONEFLOW_PLANE_LIKE_UI_DIRECTION.md`: Plane is the primary UI/workflow reference, but OneFlow must implement Plane-like screens through clean-room code without copying Plane source, packages, assets, or branding.

## Development Rules

- Prefer the architecture and conventions established by the OneFlow greenfield plan.
- Keep company-specific customizations clearly separated where possible.
- Do not introduce new abstractions until the OneFlow code structure justifies them.
- Add tests or validation steps proportional to the risk of the change.
- Document environment variables and feature flags in `.env.example` when that file exists.

## 환경변수 추가/활성화 규칙

개발 중 새로운 환경변수를 사용하거나 feature flag를 추가하는 경우 반드시 `.env`와 `.env.example`을 함께 확인한다.

* `.env.example`에는 가독성 있는 주석, 기본값, 활성화 조건을 작성한다.
* `.env.example`에는 실제 비밀값을 넣지 않는다.
* feature flag의 기본값은 원칙적으로 안전한 값, 보통 `false`로 둔다.
* 로컬 개발에서 실제로 켜야 하는 값은 `.env`에 추가한다.
* 환경변수 값 파싱 방식이 제한적인 경우 예: 정확히 `true`만 허용, 주석에 명시한다.
* 설정 변경 후 재기동이 필요한 경우 `.env.example`과 PR 설명에 명시한다.
* 후속 기능 배선과 E2E 검증이 끝나기 전에는 단순히 flag만 켜지 않는다.
* PR 설명에는 환경변수 변경 여부, 기본값, 활성화 방법, 검증 결과를 반드시 포함한다.

## 환경 설정 UI 반영 규칙

프로젝트에 관리자 설정 화면, 환경 설정 화면, 사용자 설정 화면이 있는 경우, 새로 추가된 환경변수 또는 feature flag와 관련된 설정이 UI에서 조정되어야 하는지 검토한다.

* 운영자/관리자가 시스템 전역으로 관리해야 하는 값은 관리자 또는 환경 설정 UI에 반영한다.
* 일반 사용자가 개인별로 선택해야 하는 값은 사용자 설정 UI에 반영한다.
* 설정 UI에 추가할 때는 대상 사용자, 표시명, 설명, 기본값, 활성화 조건, 유효성 검증, 저장/적용 방식, 재기동 필요 여부를 함께 정의한다.
* 비밀값, API Key, 토큰 등 민감 정보는 일반 사용자에게 노출하지 않으며, 필요한 경우 관리자 권한, 마스킹, 저장 위치, 감사 로그 필요 여부를 검토한다.
* 빌드 타임 전용 값, 내부 개발용 flag, 실험 중인 미배선 값은 무리하게 UI에 노출하지 않는다.
* PR 설명에는 환경변수 변경 여부, 설정 UI 반영 여부, UI 경로, 대상 사용자, 기본값, 활성화 방법, 재기동 필요 여부, 검증 결과를 포함한다.

## 목표 수행 시 검증/재검증 원칙

* Claude Code와 Codex가 목표(goal)를 받아 코드, 설정, 문서, 테스트, 빌드 스크립트 등 프로젝트 산출물을 변경하는 경우 작업 성격에 맞는 검증을 반드시 수행한다.
* 가능한 검증 항목은 build, lint, typecheck, unit test, integration test, E2E, 수동검증, 회귀검증이다.
* 검증 중 오류가 발생하면 원인을 분석하고 최소 범위로 수정한 뒤 동일 검증을 다시 실행한다.
* 오류 수정 후 재검증이 PASS 될 때까지 수정 → 검증을 반복한다.
* 신규 기능이 정상 동작하더라도 기존 기능이 깨지면 완료로 보지 않는다.
* feature flag가 있는 목표는 OFF 상태의 기존 동작과 ON 상태의 신규 동작을 모두 확인한다.
* 검증하지 못한 항목은 완료로 표현하지 말고 “미검증”과 사유를 명확히 기록한다.
* 목표 완료 보고와 PR 설명에는 실행한 검증, 결과, 실패 원인, 수정 내용, 재검증 결과를 포함한다.

## Git 운영 원칙

* `main`, `master`, `develop` 등 기본 브랜치에 직접 커밋하거나 push하지 않는다.
* 작업 전 기본 브랜치를 최신 상태로 동기화한다.
* 모든 작업은 목적이 명확한 작은 작업 브랜치에서 진행한다.
* 하나의 브랜치와 PR에는 하나의 목적만 담는다.
* 커밋은 작고 되돌리기 쉽게 나누며, 커밋 메시지는 변경 목적이 드러나게 작성한다.
* 검증 실패 상태로 PR을 생성하거나 완료 보고하지 않는다.
* PR 설명에는 변경 요약, 영향 범위, 검증 결과, 재검증 이력, 남은 리스크를 포함한다.
* PR 머지는 기본적으로 사용자의 명시적 승인 후 수행한다.
* 예외적으로 자동승인 모드가 활성화되어 있거나, 사용자가 해당 작업 요청 안에서 "머지까지 진행", "PR 생성 후 머지", "merge까지"처럼 머지 수행을 명시한 경우에는 별도 재확인 없이 검증 통과와 PR 상태 확인 후 머지까지 진행한다.
* 이 예외는 기본 브랜치 직접 커밋/push 금지를 해제하지 않는다. 항상 브랜치 → PR → 검증 → 머지 절차를 유지한다.
* 비밀값, API Key, 운영 DB 정보, 실제 `.env` 비밀값은 커밋하지 않는다.
* 이미 머지된 작업의 후속을 진행할 때는 최신 기본 브랜치를 다시 동기화한 뒤 새 브랜치를 생성한다.

## OneFlow Base-Specific Verification

Run the checks appropriate to the OneFlow greenfield stack:

- FastAPI backend tests, lint/type checks, and migration smoke tests as applicable.
- React/Vite frontend typecheck, lint, build, and route smoke checks as applicable.
- Documentation, clean-room, environment, and worklog checks for planning-only changes.
