# packages/shared

Placeholder for shared API contract types. A follow-up PR generates TypeScript
types (and optionally TanStack Query hooks) from the FastAPI OpenAPI schema so
the server contract and frontend types have a single source of truth.

Until then, frontend response types live in `apps/web/src/features/*/types.ts`
and are manually cross-checked against `/openapi.json` in the Broad
verification checklist (docs/ONEFLOW_PLAN.md §13).
