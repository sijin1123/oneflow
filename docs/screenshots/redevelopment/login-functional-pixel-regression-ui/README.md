# UI-169 Login Functional Pixel Regression

- Approved source: `docs/oneflow-login-origin.png`, `1448x1086`, SHA-256 `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`.
- Live desktop capture: Chromium `1455x1259`, centered product panel `(117.5,172) 1220x915`.
- Normalization: crop integer physical bounds `(118,172)-(1338,1087)`, then Lanczos resize to `1448x1086`.
- Source integrity: story crop `(0,0)-(792,1086)` MAE `0`; auth logo crop `(1011,100) 205x70` MAE `0`.
- Stable DPR 1 metrics: full/story/auth MAE `2.696/1.599/4.021`; Kanban `1.894`; auth brand `4.171`; fields `4.976`; providers `7.254`.
- Max-channel delta `<=12`: full/story/auth `95.46%/96.90%/93.73%`.
- DPR 2 brand: Chromium selects `oneflow-login-logo-lockup@2x.png`; measured auth-logo edge energy rises from `3.907` to `4.279` (`+9.54%`) without changing CSS geometry or the approved 1x source.

Artifacts:

- `desktop.png`: DPR 1 functional desktop surface.
- `desktop-dpr2.png`: DPR 2 functional desktop surface and selected high-density brand asset.
- `mobile.png`: `390x844` functional responsive surface.
- `runtime-normalized.png`: desktop product panel in approved-source coordinates.
- `reference-runtime-side-by-side.png`: approved source / normalized functional runtime.
- `reference-runtime-diff-5x.png`: absolute RGB difference amplified 5x.

The left story and logo are bounded OneFlow-owned visual assets. The authentication surface is semantic DOM from first paint; no full-screen screenshot overlay, transparent hit layer, mock action, or dead control is used.
