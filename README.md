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
| DB | PostgreSQL 17 (로컬: Docker Compose · 운영: 외부 managed/전용 DB — `../docs/ONEFLOW_POSTGRESQL_DEPLOYMENT_POLICY.md`) |
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
| 프론트 unit(순수함수 node --test) | `make web-unit` |
| UI 스모크(Playwright·목킹) | `make web-e2e` |
| OpenAPI 타입 생성/드리프트 | `make gen-types` / `make check-types` |
| 클린룸 게이트 | `make cleanroom-check` |

## Storage sweep 운영 절차 (고아 블롭 정리)

업로드 스토리지에는 크래시가 남긴 `.upload-*` 임시 파일과, attachment 행이 삭제된 뒤 남은 고아 블롭이 쌓일 수 있습니다. 정리는 반드시 아래 순서를 따릅니다.

1. **dry-run**: `make api-sweep-blobs` — 후보 목록만 출력하며 아무것도 이동/삭제하지 않습니다. `--json`을 붙이면 기계가독 리포트를 얻습니다.
2. **검토**: 후보가 예상과 다르면(대량 발생, 최근 파일 다수) 중단하고 원인을 확인합니다. `min-age`(기본 24h) 이내 파일과 인식 불가/symlink 경로는 항상 보호됩니다.
3. **격리 실행**: `make api-sweep-blobs-delete` — 후보를 `<storage root>/.quarantine/<runstamp>/`로 **이동**(unlink 아님)하고 `manifest.json`을 남깁니다. 실행 직전 DB 키를 재조회해 두 스냅샷 합집합에 없는 파일만 격리합니다.
4. **보관/복구**: manifest를 백업 위치에 보관합니다. 오탐이면 manifest의 원경로대로 되돌리면 복구됩니다. 격리 영역은 이후 sweep이 건드리지 않으며, 최종 purge(영구 삭제)는 보존 기간 경과 후 운영자가 수동으로 수행합니다.
5. **missing blob 행**: 리포트의 "rows with MISSING blobs"는 블롭이 사라진 attachment 행입니다 — 스크립트는 삭제하지 않으며, 데이터 복원 여부는 운영 판단입니다.

## 기한(due-date) 알림 운영 절차 (Pass 40)

담당 작업의 기한 알림(내일 마감 `due_soon` / 오늘 처음 초과 `overdue`)을 인앱 수신함에 넣는다.
앱에 스케줄러가 없으므로 운영 cron이 **매일 1회(UTC 자정 이후)** 실행한다.

```bash
cd apps/api
uv run python -m app.services.due_alerts            # dry-run: 생성될 건수만 보고
uv run python -m app.services.due_alerts --create   # 실제 생성
```

- **멱등**: 같은 (사용자, 작업, 종류)의 당일(UTC) 중복 생성은 NOT EXISTS로 차단 — 재실행 안전.
- **동시 실행 방지**: advisory lock(427007) — 후발 프로세스는 exit code 2로 즉시 종료.
- **폭주 없음**: overdue는 '어제가 기한'인 항목만 알림(백필 없음). 실행을 놓친 날은 보충되지 않는다.
- 대상: 담당자가 현재 프로젝트 멤버이면서 활성 사용자이고, 기한 알림 토글이 켜져 있는 경우만.
- 로그 예: `created: due_soon=3` / `created: overdue=1`. exit 0=성공, 2=락 미획득.

## 백업/복구 런북

백업 대상은 두 가지입니다: **PostgreSQL 데이터베이스**(메타데이터 전부)와 **업로드 스토리지 디렉터리**(`ONEFLOW_STORAGE_DIR`, 기본 `apps/api/var/uploads` — 블롭 본문). 반드시 **DB를 먼저, 블롭을 나중에** 백업합니다 — 행⇄블롭 계약상 "블롭만 남는" 고아는 무해하고 스윕 가능하지만, "행만 남는" 결손은 다운로드가 깨집니다.

### 백업

```bash
# 1) DB 덤프 (로컬 개발 컨테이너 기준 — 운영은 관리형 DB의 스냅샷/pg_dump 사용)
docker exec oneflow-postgres pg_dump -U oneflow -d oneflow -Fc   > backup/oneflow-$(date +%Y%m%dT%H%M%S).dump

# 2) 스토리지 스냅샷 (.quarantine 포함 — 격리분도 복구 대상)
tar czf backup/uploads-$(date +%Y%m%dT%H%M%S).tar.gz -C apps/api var/uploads
```

### 복구 (역순 아님 — DB부터)

```bash
# 1) DB 복원 (기존 데이터가 있으면 --clean 사용 여부를 먼저 판단)
docker exec -i oneflow-postgres pg_restore -U oneflow -d oneflow --clean --if-exists   < backup/oneflow-<timestamp>.dump

# 2) 마이그레이션 정합 확인 — 복원본 리비전이 코드 기대와 같아야 함
cd apps/api && uv run alembic current   # 예: 0039 (head)

# 3) 블롭 복원
tar xzf backup/uploads-<timestamp>.tar.gz -C apps/api
```

### 복구 후 검증

1. `/status` 페이지(또는 `GET /api/v1/ops/status`)에서 DB 상태·마이그레이션 리비전 확인.
2. `make api-sweep-blobs`(dry-run)로 정합 점검 — **"rows with MISSING blobs"가 0이어야** DB·블롭 시점이 맞습니다(0이 아니면 블롭 백업이 DB보다 오래된 것 — 더 최신 블롭 백업으로 재복원).
3. 임의 프로젝트에서 목록/문서/첨부 다운로드 스모크.

### 주기/보존 권고

- DB 일 1회 이상 + 마이그레이션 배포 직전 1회(0001–00NN 전환 경계 보존).
- 블롭은 DB 백업 **직후** 촬영해 시점 차를 최소화. 보존 기간은 조직 정책에 따르되 최소 마지막 2세대.
- 복구 리허설을 분기 1회 권고(위 검증 3단계 포함).

CI(`.github/workflows/ci.yml`)는 `backend`/`frontend`/`cleanroom`/`security-audit` 4개 잡으로 검증합니다. 앞의 3개(`backend`/`frontend`/`cleanroom`)를 main 브랜치의 required status checks로 등록하며, `security-audit`(pip-audit·npm audit)는 자문용 비차단 잡입니다.

## Layout

```
apps/api      FastAPI 백엔드 (app/, alembic/, tests/)
apps/web      React 프론트 (src/, e2e/)
packages/shared  OpenAPI 생성 타입(@oneflow/shared) — 드리프트 게이트로 강제
scripts/      클린룸 게이트
infra/        배포 방향 문서
docs/         클린룸 노트 · 검증 기록 · 스크린샷
```

전체 계획·검증 이력: `../docs/ONEFLOW_PLAN.md` (워크스페이스 루트), 작업 원장: `../docs/PROJECT_WORKLOG.md`.
