# UI235 My Work Profile Evidence

## Scope

- Surface: personal Assigned, Created, Subscribed, and Activity work views
- Reverse-spec references: D024-D027
- Clean-room rule: behavior and information hierarchy were reimplemented with OneFlow components, routes, and APIs.

## UI changes

- Removed the duplicate explanatory profile header from each relationship tab.
- Moved the five personal-work tabs directly below the central frame header.
- Combined the work list and an on-demand profile rail in one full-height workspace.
- Kept the rail visible by default on desktop and collapsed by default on mobile.
- Tightened search, scope, sort, reset, count, pagination, loading, error, and empty states.

## Functional and API coverage

- Assigned, Created, Subscribed, and Activity still use their existing relationship APIs.
- Search, open/all scope, updated/due sort, and pagination remain URL-backed.
- Profile identity comes from the real current-user query.
- Participating projects come from the real project directory query and deep-link to each overview.
- Profile edit opens the actual personal settings route; no dead controls were added.

## Runtime verification

- `runtime-desktop.png`: desktop relationship list with profile rail.
- `runtime-mobile.png`: mobile relationship list with the profile rail explicitly collapsed.
- Focused Playwright coverage verifies URL/API behavior, profile data and links, desktop open/mobile toggle behavior, error retry, and horizontal containment.

## Deferred items

- None for this surface. There is no authoritative joined-date field in the current identity contract, so no decorative or inferred date is displayed.
