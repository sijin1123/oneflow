#!/usr/bin/env bash
# Regenerate the shared TypeScript API contract types from the FastAPI OpenAPI
# schema (PLAN §8/§13 — single source of truth for the frontend contract).
#
#   scripts/gen-openapi-types.sh            # write into packages/shared
#   scripts/gen-openapi-types.sh <outfile>  # write elsewhere (drift check)
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${1:-packages/shared/src/api-types.ts}"
SCHEMA="$(mktemp -t oneflow-openapi.XXXXXX.json)"
trap 'rm -f "$SCHEMA"' EXIT

(cd apps/api && uv run python -m app.openapi_export) > "$SCHEMA"

mkdir -p "$(dirname "$OUT")"
HEADER="/* AUTO-GENERATED from the FastAPI OpenAPI schema — do not edit by hand.
   Regenerate with: scripts/gen-openapi-types.sh (or make gen-types). */"
printf '%s\n\n' "$HEADER" > "$OUT"
(cd packages/shared && npx --yes openapi-typescript "$SCHEMA") >> "$OUT"

echo "wrote $OUT"
