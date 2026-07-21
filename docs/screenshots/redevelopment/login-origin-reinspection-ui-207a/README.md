# UI-207A Login origin pixel reinspection evidence

- Visual authority: user-owned OneFlow source `apps/web/src/assets/generated/oneflow-login-origin-reference.png` (`1448x1086`).
- Authority SHA-256: `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`.
- `desktop-1448x1086.png`: lossless Chromium capture with the real authentication controls and API-connected dev sign-in state.
- `in-app-953x917.png` and `mobile-390x844.png`: compact desktop and mobile responsive captures.
- `reference-runtime-side-by-side.png`: approved source followed by the current functional runtime.
- `pixel-diff-x8.png`: absolute RGB delta amplified by 8x brightness and 2x contrast.
- `pixel-metrics.json`: fixed-bounds MAE, p95, maximum channel delta and threshold coverage.

The approved source and runtime authority have the same SHA-256. At the source viewport, the story brand, headline, Kanban board, calendar, activity card and auth logo are pixel-identical (`MAE 0.0000`). The complete story surface is `MAE 0.0123`; its only non-zero pixels are the live collaboration-route accent. The full functional page is `MAE 1.3132` with p95 channel delta `2`.

UI-207A retains the semantic authentication surface and only corrects the divider geometry. Its first segment now begins at `x=901` with width `164.75`, and the second begins at `x=1132.234375` with width `194.765625`, matching the source raster's asymmetric line geometry. Divider MAE improves from `1.3036` to `1.2381` and p95 from `6` to `3`.
