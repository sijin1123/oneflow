# UI-231 Project Pages Surface

This evidence set covers the clean-room Project Pages directory reconstructed
from reverse-spec surfaces D014 and D028-D030.

## UI changes

- `desktop-1280x720.png`: public scope with the compact frame action, URL-backed
  search and sort controls, hierarchy rows, and the active Pages navigation item.
- `mobile-390x844.png`: private scope at mobile width with the same usable
  directory controls and no document-level horizontal overflow.
- `chrome-cdp-runtime-2798x1732.png`: lossless Chrome CDP capture of the real
  API-backed empty state at the native browser pixel size.
- Project documents stay in the Projects shell context. The project accordion
  exposes Overview, Work items, Cycles, Modules, Views, and Pages first, matching
  the observed information architecture without copying Plane source or assets.

## Function and API behavior

- Public, private, and archived scopes are URL-addressable.
- Search and four sort modes persist in the URL.
- Add page calls the existing create-document mutation and routes to the created
  page only after a successful server response.
- Existing document query, visibility/archive, hierarchy, detail navigation, and
  member read-only contracts are reused. No mock or dead control is included.
- No API, DB, migration, dependency, environment, or Settings UI change is
  required for this directory surface.

## Verification

- Typecheck, lint, production build, 108 unit tests, and 9 component tests pass.
- Eight focused shell, sidebar, global Wiki, desktop Pages, and mobile Pages E2E
  scenarios pass.
- Clean-room dependency/license/name-overlap gate passes with 161 frontend and
  45 backend packages.
- The broader pre-final E2E run passed 375 scenarios with one intentional skip;
  its single parallel sidebar timing failure passed in isolated single-worker
  revalidation.

## Deferred

- The Page editor/detail surface observed in D015 is intentionally assigned to
  the next UI-surface PR. The directory itself has no deferred control or API.
