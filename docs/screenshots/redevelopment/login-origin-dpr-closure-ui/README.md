# UI-162 Login Origin DPR Closure

## Comparison contract

- Source of truth: `docs/oneflow-login-origin.png` (`1448x1086`).
- Runtime 1x asset SHA-256: `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`.
- Source-of-truth SHA-256: `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`.
- Runtime 2x asset: deterministic Lanczos resample to `2896x2172`; no generative redraw, recoloring, crop, or filter was used.
- Browser: Chromium, light theme, reduced motion, English locale, identical mocked `auth/config` response for baseline and final.
- Desktop: `1448x1086`, DPR 2. The centered product panel is `1220x915` at `(114, 85.5)` and is normalized back to the reference dimensions before comparison.
- Mobile: `390x844`, DPR 3. Document `scrollWidth === clientWidth === 390`; the page selects the 2x art and brand sources and has no horizontal overflow.

## Pixel audit

Mean absolute RGB channel error (MAE) is measured after the baseline and final runtime panels are normalized to the reference dimensions. Lower is closer.

| Region | Baseline | UI-162 | Delta |
|---|---:|---:|---:|
| Full composition | 2.725 | 2.683 | -0.042 |
| Left composition | 2.096 | 2.015 | -0.081 |
| Top ornaments | 1.179 | 1.090 | -0.088 |
| Left brand lockup | 4.331 | 4.219 | -0.113 |
| Headline | 4.661 | 4.395 | -0.266 |
| Supporting copy | 4.916 | 4.732 | -0.184 |
| Kanban card | 2.318 | 2.238 | -0.080 |
| Mountains and S-river | 2.104 | 2.055 | -0.049 |
| Calendar card | 2.405 | 2.333 | -0.072 |
| Collaboration route | 2.615 | 2.603 | -0.012 |
| Activity card | 3.073 | 2.986 | -0.087 |
| Progress card | 2.534 | 2.460 | -0.074 |
| Foreground foliage and waves | 2.198 | 2.133 | -0.065 |
| Testimonial card | 1.741 | 1.656 | -0.085 |
| Auth brand lockup | 1.614 | 1.534 | -0.080 |

The live auth card remains semantic, keyboard-operable DOM connected to OneFlow authentication. Its unchanged text rasterization and browser-native controls remain within `+/-0.104` MAE of the baseline regions; it is not replaced with a dead screenshot.

## Evidence

- `desktop-1448x1086-dpr2.png`: actual desktop viewport.
- `mobile-390x844-dpr3.png`: actual mobile viewport.
- `mobile-full-page-390px-dpr3.png`: complete mobile document; it intentionally equals one viewport because the compact flow fits without hidden overflow.
- `reference-runtime-side-by-side.png`: reference and runtime normalized to the same dimensions.
- `runtime-pixel-difference-x5.png`: absolute RGB difference amplified 5x for inspection.
