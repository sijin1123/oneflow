# UI-210 Login Origin Exhaustive Reinspection

## Authority

- Source: `/Users/ksj/Projects/projectmanagement/oneflow/docs/oneflow-login-origin.png`
- Source SHA-256: `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`
- The tracked full reference image has the same SHA-256.
- The story crop and both login logo crops are pixel-exact derivatives of that source.

## Root cause and correction

At the in-app browser's `562 x 734` viewport, the previous `880px` breakpoint changed the page to a stacked layout. It rendered a `547 x 190` story crop from a roughly `1001 x 1373` image and placed the form below it, so the approved full composition, background, and logo appeared unrelated to the source.

The compact desktop breakpoint now keeps the approved logical `1448 x 1086` canvas and scales it uniformly to `562 x 421.5`, centered vertically. The story/auth split remains `792:656`, the whole form stays visible, and the document has no horizontal or vertical overflow. Phone widths at `520px` and below retain the focused stacked sign-in flow.

## Pixel evidence

| Region | Desktop MAE | Desktop p95 | Delta <= 2 |
| --- | ---: | ---: | ---: |
| Full canvas | 1.3106 | 2 | 95.1049% |
| Story surface | 0.0122 | 0 | 99.9308% |
| Story brand | 0.0000 | 0 | 100.0000% |
| Story headline | 0.0000 | 0 | 100.0000% |
| Kanban board | 0.0000 | 0 | 100.0000% |
| Calendar | 0.0000 | 0 | 100.0000% |
| Activity card | 0.0000 | 0 | 100.0000% |
| Auth logo | 0.0000 | 0 | 100.0000% |
| Functional auth surface | 2.8781 | 7 | 89.2785% |

At `562 x 734`, the uniformly scaled full panel has MAE `2.5290` and p95 `9` against a Lanczos-resized reference. Chromium subpixel scaling and live text/control rasterization account for the remaining measurable differences. Full region data is in `pixel-metrics.json`.

## Files

- `in-app-before-after.png`: previous crop beside the corrected compact desktop canvas
- `in-app-reference-runtime-side-by-side.png`: resized authority beside the corrected in-app runtime
- `reference-runtime-side-by-side.png`: `1448 x 1086` authority beside runtime
- `pixel-diff-x8.png`: desktop absolute RGB difference amplified 8x
- `desktop-1448x1086.png`: lossless desktop runtime capture
- `in-app-562x734.png`: lossless compact desktop runtime capture

The runtime form remains semantic and functional rather than a raster overlay. Empty submit still surfaces validation and focuses the email field.
