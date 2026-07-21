# UI-199 Login Origin Full-canvas Closure

## Comparison contract

- Source of truth: `docs/oneflow-login-origin.png` (`1448x1086`).
- Browser: Chromium, light theme, English locale, mocked `auth/config` in `dev` mode.
- Desktop: `1448x1086`, DPR 1. The OneFlow canvas fills the viewport without an outer gutter.
- Source geometry: story panel `792x1086`; auth card `523x892` at `(852, 70)`.
- Mobile: `390x844`, responsive single-column document with no horizontal overflow.
- The left composition and both brand lockups use approved OneFlow raster assets. The auth form remains semantic, keyboard-operable DOM connected to the real authentication flow.

## Pixel audit

Mean absolute RGB channel error (MAE) is measured directly against the source image at identical dimensions. Lower is closer.

| Region | MAE | Exact pixels |
|---|---:|---:|
| Full composition | 1.4930 | 66.0633% |
| Story panel | 0.0116 | 99.7977% |
| Story brand | 0.0000 | 100.0000% |
| Kanban board | 0.0000 | 100.0000% |
| Story lower composition | 0.0138 | 99.7205% |
| Auth panel | 3.2814 | 25.3352% |
| Auth card | 4.2264 | 31.3383% |
| Auth brand | 0.0189 | 97.2729% |
| Auth heading | 10.3008 | 31.7023% |
| Auth form | 5.8625 | 18.6504% |
| Footer | 3.4044 | 15.6742% |

Full-image RMSE is `6.4953`; the 95th percentile absolute channel error is `2`. The dominant remaining difference is text and live-control antialiasing in the semantic auth panel. The left source artwork is preserved pixel-for-pixel except for the intentionally animated collaboration route accent.

## Functional verification

- Login-focused Playwright: 5 passed.
- Full Playwright regression: 350 passed, 1 intentionally skipped.
- Lint: passed with four pre-existing fast-refresh warnings.
- Typecheck: passed.
- Unit: 108 passed.
- Component: 8 passed.
- Production build: passed with the existing bundle-size advisory.
- API, database, permissions, and environment variables: unchanged.

## Evidence

- `reference-1448x1086.png`: lossless desktop runtime at the source viewport.
- `in-app-1448x1086.jpg`: actual in-app Browser viewport capture with live auth configuration loaded.
- `mobile-390x844.png`: responsive mobile runtime.
- `comparison.png`: source and runtime side by side at identical dimensions.
- `difference-heatmap-10x.png`: absolute RGB difference amplified 10x.
- `metrics.txt`: machine-readable regional audit summary.
