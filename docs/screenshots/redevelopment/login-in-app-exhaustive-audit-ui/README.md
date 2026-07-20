# UI-180 Login In-App Exhaustive Pixel Audit

- Approved source: `apps/web/src/assets/generated/oneflow-login-origin-reference.png`, `1448x1086`.
- Source SHA-256: `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`.
- Live capture: Codex in-app Chromium, DPR 1, viewport `1455x1259`.
- The in-app screenshot transport returns JPEG bytes; `desktop.png` preserves that observed viewport after lossless container conversion, while `desktop-lossless.png` records the same server and viewport through Chromium PNG for typography inspection without capture-codec blur.
- Product panel: `(117.5,172) 1220x915`; integer crop `(118,172)-(1338,1087)` normalized to the approved source with Lanczos.
- Layout: document `scrollWidth === clientWidth`; mobile canvas `scrollWidth === clientWidth === 375` inside the `390x844` viewport.

## Source Integrity

The runtime full reference is byte-identical to the approved source. The story crop `(0,0)-(792,1086)` and auth logo crop `(1011,100) 205x70` each have pixel MAE `0`. CI now pins SHA-256 for the full, story, and logo 1x/2x assets in `loginAssets.test.ts`.

## In-App Render Metrics

| Region | MAE | Max-channel delta <= 12 |
|---|---:|---:|
| Full product panel | 4.088 | 90.67% |
| Story | 4.034 | 89.69% |
| Top decoration | 1.967 | 97.36% |
| Story brand | 4.102 | 85.87% |
| Headline | 5.742 | 75.72% |
| Kanban | 3.115 | 94.70% |
| River / terrain | 5.392 | 84.26% |
| Activity cards | 5.617 | 80.28% |
| Foreground | 4.064 | 90.70% |
| Auth surface | 4.153 | 91.84% |
| Auth card | 5.181 | 88.37% |
| Auth brand | 7.230 | 86.17% |
| Fields | 4.527 | 91.33% |
| Providers | 8.345 | 87.27% |

Residual render delta includes compact down-sampling, the in-app JPEG capture codec, browser color management, semantic DOM font rasterization, and the animated collaboration-path highlight. It is not a different background or logo asset.

## Rejected Rendering Experiments

- Forcing the story 2x asset at DPR 1 reduced full MAE by only `0.003` while weakening the baked story-logo edge, so the exact 1x source selection remains.
- `-webkit-optimize-contrast` raised auth-logo edge energy but worsened reference MAE in the same-session A/B capture, so the browser-default interpolation remains.
- Releasing the animation's final identity transform increased story MAE `4.034 -> 4.760` and Kanban MAE `3.193 -> 4.216`, so the sharper existing composition behavior remains.

## Artifacts

- `desktop.png`: live desktop login surface.
- `desktop-lossless.png`: same local login surface and viewport captured as PNG to separate browser rendering from the in-app JPEG transport.
- `mobile-viewport.png`: live mobile top viewport.
- `mobile-bottom.png`: live mobile lower viewport and footer.
- `runtime-normalized.png`: desktop product panel in approved-source coordinates.
- `reference-runtime-side-by-side.png`: approved source and normalized live runtime.
- `reference-runtime-diff-5x.png`: absolute RGB difference amplified 5x.

The authentication card remains semantic, keyboard-operable DOM wired to the real OneFlow auth API. No full-screen reference overlay, transparent hit layer, mock action, or dead control is used.
