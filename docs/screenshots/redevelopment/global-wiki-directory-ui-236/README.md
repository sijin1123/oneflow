# UI-236 Global Wiki directory evidence

- `runtime-desktop.png`: compact Shared/Private/Archived Wiki directory at `1280x720`.
- `runtime-mobile.png`: the same URL-backed surface at `390x844` without horizontal overflow.

## UI change

The global Wiki frame now keeps bucket identity in the context sidebar and uses the main frame for
a dense document directory. Search, project filtering, sorting, result count, empty states, and the
project-aware Add page dialog share the existing OneFlow shell tokens and responsive behavior.

## Function and API

The focused Playwright scenario verifies URL-backed search/filter/sort state, bucket navigation,
dialog focus trap and return, project/visibility selection, the real create request payload, editor
navigation after creation, archived read-only behavior, zero-project behavior, and desktop/mobile
containment. Document create/update/delete/lifecycle mutations now invalidate the workspace
document query so this directory refreshes without a reload.

## Deferred

No mock or dead control remains in this surface. Rich document editing and project-level document
lifecycle continue to use their existing functional routes; collaborative presence and document
version history remain separate future surfaces. No database, permission, environment variable, or
Settings UI contract changed.
