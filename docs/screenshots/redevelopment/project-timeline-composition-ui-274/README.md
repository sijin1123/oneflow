# UI-274 Project Timeline Composition

- `desktop.png`: compact frame controls, URL-backed week scale/focus and one full-height DHTMLX schedule canvas.
- `mobile.png`: the document remains within `390x844`; the schedule canvas owns its horizontal timeline navigation without expanding the page.
- `loading.png`: task-grid and date-lane geometry remain stable while work items are pending.
- `error.png`: the same timeline geometry remains visible behind an actionable retry state.

All captures use the local deterministic Playwright API fixture and Chromium. The implementation reuses OneFlow-owned APIs and the existing MIT-pinned DHTMLX integration; no Plane source, asset, CSS, DOM or exact trade dress is included.
