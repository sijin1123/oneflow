# UI-275 Project Backlog Composition

- `desktop.png`: compact frame controls, truthful unassigned count, dense work rows, cycle assignment, and item actions in one full-height surface.
- `mobile.png`: all work, cycle, and action columns remain usable inside `390x844` without document-level horizontal overflow.
- `loading-mobile.png`: the same row and column geometry remains stable while backlog work items are pending.

All captures use the local deterministic Playwright API fixture and Chromium. The implementation reuses OneFlow-owned work-package, cycle, permission, drawer, and creation contracts; no Plane source, asset, CSS, DOM, or exact trade dress is included.
