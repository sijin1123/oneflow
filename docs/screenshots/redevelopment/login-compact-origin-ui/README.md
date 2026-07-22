# UI-212 Login compact origin reinspection

## Scope

- Approved authority: `oneflow/docs/oneflow-login-origin.png` (`1448x1086`)
- Runtime: OneFlow `/login` with functional email/password, provider, assistance, locale and policy controls
- In-app Browser viewport: `914x800`, DPR 1
- Desktop lossless viewport: `1448x1086`, DPR 1

## Result

The runtime full-reference file is byte-identical to the approved authority. The story crop and both login logo crops are pixel-exact source derivatives. Desktop/tablet rendering now keeps the complete `1448x1086` logical canvas and uniformly scales it instead of switching to unrelated compact crops or stacked geometry.

At the lossless source viewport, full-canvas MAE is `1.3115` and p95 channel delta is `2`. The complete story surface is `0.0123`; story brand, headline, Kanban, calendar, activity card and auth logo are `0.0000`. The animated collaboration path is `0.0398`. The semantic authentication surface is `2.8800`; its remaining delta is concentrated in browser-rasterized live text, emoji and controls rather than the approved bitmap assets.

The actual in-app Browser panel is `(0,57.25) 914x685.5` at zoom `0.631215`. Its document scroll size is exactly `914x800`, so the compact layout introduces no horizontal or vertical document overflow. Compared with a Lanczos-scaled authority, the in-app screenshot transport records full-panel MAE `4.0403`, story `4.2763` and auth `3.7553`. These values include in-app screenshot codec/color handling and fractional browser downsampling; the lossless screenshot above is the pixel-fidelity authority.

## Evidence

- `desktop-1448x1086.png`: lossless functional runtime at the authority size
- `in-app-914x800.png`: repository Playwright capture at the in-app viewport
- `in-app-browser-914x800.png`: actual Codex in-app Browser capture
- `reference-panel-914x686.png` / `runtime-panel-914x686.png`: normalized compact panel pair
- `side-by-side-1448x1086.png` / `side-by-side-914x686.png`: authority and runtime comparisons
- `diff-x8-1448x1086.png` / `diff-x8-914x686.png`: amplified absolute RGB differences
- `pixel-metrics.json`: fixed-region MAE, p95, max delta and threshold coverage

No API, database, migration, permission, environment variable, dependency or Settings UI contract changed in this surface. There is no deferred login control: every visible action remains wired to its existing functional flow.
