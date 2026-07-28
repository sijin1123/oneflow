# UI-277 Project Dashboard Composition

This folder records UI-277 visual verification for the functional project
Dashboard surface.

- `desktop.png`: compact operational metrics, budget, progress, distributions,
  recent work, and the real refresh, widget editor, and CSV actions.
- `mobile.png`: the same dashboard information hierarchy contained at
  `390x844` without document-level horizontal overflow.
- `loading-mobile.png`: dashboard-shaped skeletons that retain the final frame
  actions and result geometry.
- `error-mobile.png`: independently recoverable dashboard-data and widget-layout
  errors presented as compact result bands.

The surface is independently implemented with OneFlow APIs, authorization,
React Query state, local tokens, Lucide icons, and the existing personal/shared
widget contracts. No Plane source, package, asset, CSS, DOM hierarchy, exact
visual tokens, wording, or branding was copied.
