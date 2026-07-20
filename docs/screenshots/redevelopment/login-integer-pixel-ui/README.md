# UI-182 Login Integer Pixel Convergence

- Approved source: `apps/web/src/assets/generated/oneflow-login-origin-reference.png`, `1448x1086`, SHA-256 `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`.
- Live inspection: Codex in-app Chromium, DPR 1, viewport `1455x1259`.
- Previous geometry: product panel `(117.5,172) 1220x915`, story `(117.5,172) 667.28125x915`, auth logo `172.703125x58.96875`.
- Final geometry after the finite entrance animation: product panel `(118,172) 1220x915`, story `(118,172) 667x915`, auth logo `173x59`.
- The desktop story and logo candidates are deterministic Lanczos resamples of the approved OneFlow-owned source crops. No generated reinterpretation, logo reconstruction, third-party asset, transparent hit layer, or static authentication screenshot is used.

## Pixel comparison

The lossless Chromium product panel was cropped and normalized to the approved `1448x1086` coordinate space with the same Lanczos procedure used by UI-180.

| Region | UI-180 MAE | UI-182 MAE | UI-180 delta <= 12 | UI-182 delta <= 12 |
|---|---:|---:|---:|---:|
| Full panel | 4.088 | 2.632 | 90.67% | 95.34% |
| Story | 4.034 | 1.791 | 89.69% | 96.38% |
| Story brand | 2.894 | 2.621 | 91.75% | 94.36% |
| Headline | 4.917 | 5.009 | 81.64% | 87.92% |
| Kanban | 3.019 | 1.902 | 95.17% | 96.10% |
| River / terrain | 5.304 | 1.658 | 84.57% | 96.90% |
| Activity cards | 5.615 | 2.198 | 81.91% | 95.26% |
| Foreground | 3.838 | 1.408 | 91.72% | 97.25% |
| Auth surface | 4.153 | 3.649 | 91.84% | 94.09% |
| Auth brand | 5.743 | 2.822 | 90.44% | 94.15% |
| Fields | 4.042 | 4.023 | 93.37% | 93.53% |
| Providers | 5.882 | 6.524 | 90.13% | 88.85% |

The headline and provider MAE residual is browser font rasterization in functional semantic DOM; their broad `delta <= 12` acceptance remains close to the approved reference without replacing controls with dead pixels. The in-app screenshot transport still returns JPEG bytes, so `desktop.png` and the normalized comparison artifacts were captured losslessly by the repository Playwright verification against the same server and viewport.

## Artifacts

- `desktop.png`: lossless `1455x1259` desktop runtime.
- `mobile.png`: lossless `390x844` mobile runtime with no horizontal overflow.
- `runtime-normalized.png`: desktop product panel normalized to approved source coordinates.
- `reference-runtime-side-by-side.png`: approved source and normalized runtime.
- `reference-runtime-diff-5x.png`: absolute RGB difference amplified 5x.
