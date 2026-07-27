# UI-273 Project Calendar Composition

- `desktop.png`: compact frame controls, actual month navigation and one full-height due-date month grid.
- `mobile.png`: the document remains within `390x844`; the month grid scrolls inside its own bounded surface so day cells and work-item actions remain usable.
- `loading.png`: weekday and month-cell geometry remain stable while data is pending.
- `error.png`: the same month geometry remains visible behind an actionable retry state.

All captures use the local deterministic Playwright API fixture and Chromium. The implementation reuses OneFlow-owned APIs and components; no Plane source, asset, CSS, DOM or exact trade dress is included.
