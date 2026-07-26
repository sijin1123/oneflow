# UI234 Work Item Detail Evidence

## Scope

- Surface: full-page work item detail
- Reverse-spec references: D017-D023 and `states/S027-detail-current-live.png`
- Clean-room rule: behavior, information hierarchy, and interaction patterns were reimplemented with OneFlow components and APIs.

## UI changes

- Removed the duplicated page title and nested detail frame.
- Moved the stable work item key and functional commands into the central frame context bar.
- Reorganized the page into title and core properties, description, linked-content shortcuts, activity, extended data, and a dedicated properties rail.
- Exposed all six activity filters and the comment composer without an extra page-level tab.
- Kept the desktop properties rail open and the mobile rail collapsed on initial load.

## Functional and API coverage

- Subject editing uses the existing versioned `PATCH` contract.
- Watch, duplicate, and move commands retain their existing API-backed behavior.
- Comments post through the existing comments endpoint.
- Status, priority, assignee, schedule, custom fields, time, cost, relations, pages, and attachments retain their existing controls and validation.
- Relation, page, and attachment shortcuts scroll to the corresponding functional section; no dead controls were added.

## Runtime verification

- `runtime-desktop.png`: actual API data at 1137 x 1186.
- `runtime-mobile.png`: actual API data at 375 x 812.
- Desktop and mobile document widths matched their scroll widths, so the detail surface did not introduce horizontal overflow.
- Focused Playwright verification covered the full-page information hierarchy, versioned subject save, watch, comment creation, activity filters, properties behavior, resizing, and mobile containment.

## Deferred items

- None for this surface. Broader work item list, saved-view, and remaining product surfaces continue in later UI-first milestones.
