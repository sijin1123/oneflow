# @oneflow/shared

Generated TypeScript API contract types, produced from the FastAPI OpenAPI schema
so the server contract and the frontend have a single source of truth
(docs/ONEFLOW_PLAN.md §8/§13).

- `src/api-types.ts` is **auto-generated** — never edit it by hand.
- Regenerate after any API change:

  ```bash
  make gen-types          # scripts/gen-openapi-types.sh
  ```

- CI fails if the committed file drifts from the live schema:

  ```bash
  make check-types        # scripts/check-openapi-types.sh (runs in the `cleanroom` job)
  ```

## Consumption

`apps/web` imports it via the `@shared/*` path alias (tsconfig + vite). The UI
keeps its own hand-written view types in `apps/web/src/features/**/types.ts`;
`apps/web/src/features/work-packages/contract.ts` asserts at compile time that
those view types stay assignable to the generated schema types, so a contract
change fails `tsc`.
