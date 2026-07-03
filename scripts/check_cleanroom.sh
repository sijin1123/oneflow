#!/usr/bin/env bash
# OneFlow clean-room gate (PLAN §10). Fails the build on:
#  (1) any @plane/* reference in JS manifests/lockfiles
#  (2) GPL/AGPL-family licenses anywhere in the dependency tree
#      (fail-closed: unknown/unclassifiable licenses also fail)
#  (4) suspicious filename overlap with reference repos without a review note
# Limitations are documented in PLAN §10 — this catches literal strings,
# license metadata and filenames; humans attest the rest via the PR checklist.
set -euo pipefail
cd "$(dirname "$0")/.."

FAIL=0

echo "== [1/4] @plane/* reference scan =="
if grep -rn --include='package.json' --include='package-lock.json' '"@plane/' apps packages 2>/dev/null; then
  echo "ERROR: @plane/* dependency reference detected — clean-room violation"
  FAIL=1
else
  echo "OK: no @plane/* references"
fi

# License policy, applied to both ecosystems:
#   deny  = /GPL/i anywhere (catches GPL/LGPL/AGPL — fail even for dual license,
#           reviewed-allow requires editing this script with a justification)
#   allow = permissive families
#   else  = fail-closed (manual review, then extend the allow list here)
LICENSE_POLICY='
const deny = /gpl/i;
const allow = /(mit|apache|bsd|isc|psf|python|0bsd|unlicense|blueoak|blue oak|cc0|cc-by|mpl|mozilla|zlib|wtfpl|artistic)/i;
function verdict(name, license) {
  const l = String(license || "UNKNOWN");
  if (deny.test(l)) return `DENY\t${name}\t${l}`;
  if (allow.test(l)) return null;
  return `UNKNOWN\t${name}\t${l}`;
}
'

echo "== [2/4] frontend license scan (license-checker) =="
if [ -d apps/web/node_modules ]; then
  (cd apps/web && npx license-checker --production --excludePrivatePackages --json) \
    > /tmp/oneflow_web_licenses.json
  BAD_WEB=$(node -e "
    $LICENSE_POLICY
    const data = require('/tmp/oneflow_web_licenses.json');
    const bad = Object.entries(data)
      .map(([name, info]) => verdict(name, info.licenses))
      .filter(Boolean);
    if (bad.length) { console.log(bad.join('\n')); process.exitCode = 0; }
  ")
  COUNT_WEB=$(node -e "console.log(Object.keys(require('/tmp/oneflow_web_licenses.json')).length)")
  if [ -n "$BAD_WEB" ]; then
    echo "ERROR (fail-closed): disallowed/unknown licenses in frontend deps:"; echo "$BAD_WEB"; FAIL=1
  else
    echo "OK: $COUNT_WEB frontend packages, all in allowed families"
  fi
else
  echo "SKIP: apps/web/node_modules missing (run npm ci first)"; FAIL=1
fi

echo "== [3/4] backend license scan (pip-licenses) =="
if [ -d apps/api/.venv ]; then
  (cd apps/api && uv run pip-licenses --format=json) > /tmp/oneflow_api_licenses.json
  BAD_API=$(node -e "
    $LICENSE_POLICY
    const data = require('/tmp/oneflow_api_licenses.json');
    const bad = data
      .map((p) => verdict(p.Name + '@' + p.Version, p.License))
      .filter(Boolean);
    if (bad.length) { console.log(bad.join('\n')); process.exitCode = 0; }
  ")
  COUNT_API=$(node -e "console.log(require('/tmp/oneflow_api_licenses.json').length)")
  if [ -n "$BAD_API" ]; then
    echo "ERROR (fail-closed): disallowed/unknown licenses in backend deps:"; echo "$BAD_API"; FAIL=1
  else
    echo "OK: $COUNT_API backend packages, all in allowed families"
  fi
else
  echo "SKIP: apps/api/.venv missing (run uv sync first)"; FAIL=1
fi

echo "== [4/4] filename-overlap spot check vs reference repos =="
# Common conventional names excluded; anything else overlapping requires a
# review note in docs/ONEFLOW_CLEANROOM_NOTES.md (manual attestation).
COMMON_ALLOWLIST='^(main|index|app|App|config|conftest|env|base|session|utils|types|constants|README|LICENSE|Makefile|package|tsconfig|vite\.config|eslint\.config|playwright\.config|\.gitignore|__init__|routes|provider|error)\.'
if [ -d ../plane ] || [ -d ../openproject ]; then
  OURS=$(find apps -type f \( -name '*.py' -o -name '*.ts' -o -name '*.tsx' \) ! -path '*/node_modules/*' ! -path '*/.venv/*' -exec basename {} \; | sort -u)
  REFS=$( (find ../plane ../openproject -maxdepth 6 -type f \( -name '*.py' -o -name '*.ts' -o -name '*.tsx' -o -name '*.rb' \) 2>/dev/null | xargs -I{} basename {} | sed 's/\.rb$/.py/' ) | sort -u )
  OVERLAP=$(comm -12 <(echo "$OURS") <(echo "$REFS") | grep -Ev "$COMMON_ALLOWLIST" || true)
  if [ -n "$OVERLAP" ]; then
    echo "NOTE: filename overlap with reference repos (content independence must be attested):"
    echo "$OVERLAP"
    if ! grep -q "filename-overlap-reviewed" docs/ONEFLOW_CLEANROOM_NOTES.md 2>/dev/null; then
      echo "ERROR: overlaps present but docs/ONEFLOW_CLEANROOM_NOTES.md lacks 'filename-overlap-reviewed' attestation"
      FAIL=1
    else
      echo "OK: overlap reviewed per cleanroom notes attestation"
    fi
  else
    echo "OK: no suspicious filename overlap"
  fi
else
  echo "SKIP: reference repos not present at ../plane, ../openproject (CI environment)"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "CLEANROOM GATE: FAIL"
  exit 1
fi
echo "CLEANROOM GATE: PASS"
