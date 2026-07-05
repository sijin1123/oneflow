# OneFlow

사내 프로젝트 관리 시스템 — 그린필드 신규 구축.

- **기능 레퍼런스**: OpenProject (행동·도메인 관찰만, 소스/스키마 복사 금지)
- **UI 레퍼런스**: Plane(1순위)·Linear·GitHub·Notion — 클린룸 자체 구현
- 클린룸 규칙과 증적: `docs/ONEFLOW_CLEANROOM_NOTES.md`, 게이트: `scripts/check_cleanroom.sh`

## Stack

| 계층 | 기술 |
|---|---|
| Backend | FastAPI · Python 3.13(uv) · SQLAlchemy 2 async(asyncpg) · Alembic |
| Frontend | React 19 · TypeScript · Vite · React Router · TanStack Query · Tailwind v4 · 자체 shadcn 스타일 컴포넌트 |
| DB | PostgreSQL 17 (로컬: Docker Compose · 운영: 외부 managed/전용 DB — `docs/../docs/ONEFLOW_POSTGRESQL_DEPLOYMENT_POLICY.md`) |
| 인증 | dev 모드(로컬 전용, 루프백 가드) → OIDC-ready 구조 |

## Quickstart (local dev)

```bash
# 0) 도구: Docker Desktop, uv, Node 24+
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 1) DB
make db-up

# 2) API (http://localhost:8000, docs: /docs)
cd apps/api && uv sync && uv run alembic upgrade head && uv run python -m app.seed
cd ../.. && make api-dev

# 3) Web (http://localhost:5173)
cd apps/web && npm ci
cd ../.. && make web-dev
```

> ⚠️ **dev 인증 모드는 로컬 전용입니다.** 코드 수준 가드가 이중으로 막지만(스테이징/운영 기동 실패 + 비루프백 클라이언트 403), dev 모드 인스턴스를 외부에 노출하지 마세요.

> ⚠️ **프로브 규약**: `/api/v1/healthz`=liveness(DB 미접촉), `/api/v1/health`=readiness(DB ping·503). liveness 프로브에 `/health`를 연결하면 DB 장애가 재시작 루프가 됩니다.

## Verification

| 항목 | 명령 |
|---|---|
| 백엔드 lint/format | `make api-lint` |
| 마이그레이션 스모크 | `make api-migrate-smoke` |
| 백엔드 테스트(실 PG) | `make api-test` |
| 프론트 typecheck/lint/build | `make web-build` |
| 프론트 unit(409 순수함수) | `make web-unit` |
| UI 스모크(Playwright·목킹) | `make web-e2e` |
| 클린룸 게이트 | `make cleanroom-check` |

CI(`.github/workflows/ci.yml`)는 `backend`/`frontend`/`cleanroom` 3개 잡으로 같은 검증을 수행하며, main 브랜치의 required status checks로 등록하는 것을 권장합니다.

## Layout

```
apps/api      FastAPI 백엔드 (app/, alembic/, tests/)
apps/web      React 프론트 (src/, e2e/)
packages/shared  OpenAPI 타입 생성(후속 PR) 자리
scripts/      클린룸 게이트
infra/        배포 방향 문서
docs/         클린룸 노트 · 검증 기록 · 스크린샷
```

전체 계획·검증 이력: `../docs/ONEFLOW_PLAN.md` (워크스페이스 루트), 작업 원장: `../docs/PROJECT_WORKLOG.md`.
