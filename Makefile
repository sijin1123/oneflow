# OneFlow developer commands. Backend runs via uv (Python 3.13), frontend via npm.

.PHONY: db-up db-down db-reset api-dev api-test api-lint api-migrate api-sweep-blobs api-sweep-blobs-delete web-dev web-build web-test cleanroom-check

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

# Destroys local DB volume — local development convenience only.
db-nuke:
	docker compose down -v

api-dev:
	cd apps/api && uv run uvicorn app.main:app --reload --port 8000

api-migrate:
	cd apps/api && uv run alembic upgrade head

api-migrate-smoke:
	cd apps/api && uv run alembic upgrade head && uv run alembic downgrade base && uv run alembic upgrade head

api-seed:
	cd apps/api && uv run python -m app.seed

# Orphan-blob sweep: dry-run reports; -delete QUARANTINES (never unlinks).
api-sweep-blobs:
	cd apps/api && uv run python -m app.services.storage_sweep

api-sweep-blobs-delete:
	cd apps/api && uv run python -m app.services.storage_sweep --delete

# Recurring-meeting sweep (Pass 69): dry-run reports; -create materializes.
api-recurring-meetings:
	cd apps/api && uv run python -m app.services.recurring_meetings

api-recurring-meetings-create:
	cd apps/api && uv run python -m app.services.recurring_meetings --create

api-test:
	cd apps/api && uv run pytest -q

api-lint:
	cd apps/api && uv run ruff check . && uv run ruff format --check .

web-dev:
	cd apps/web && npm run dev

web-build:
	cd apps/web && npm run typecheck && npm run lint && npm run build

web-unit:
	cd apps/web && npm run test:unit

web-e2e:
	cd apps/web && npm run test:e2e

cleanroom-check:
	bash scripts/check_cleanroom.sh

gen-types:
	bash scripts/gen-openapi-types.sh

check-types:
	bash scripts/check-openapi-types.sh

audit:
	cd apps/api && uv run --with pip-audit pip-audit
	cd apps/web && npm audit --audit-level=high
