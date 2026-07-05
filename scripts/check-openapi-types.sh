#!/usr/bin/env bash
# Fail if the committed shared API types drift from the live OpenAPI schema
# (PLAN §13 contract-drift gate). Run in CI after any API change.
set -euo pipefail
cd "$(dirname "$0")/.."

TMP="$(mktemp -t oneflow-apitypes.XXXXXX.ts)"
trap 'rm -f "$TMP"' EXIT

scripts/gen-openapi-types.sh "$TMP" >/dev/null

if ! diff -u packages/shared/src/api-types.ts "$TMP"; then
  echo "ERROR: packages/shared/src/api-types.ts is out of date."
  echo "Run 'make gen-types' and commit the result."
  exit 1
fi
echo "OK: shared API types match the current OpenAPI schema"
