# Login origin fidelity evidence

- Reference: `docs/oneflow-login-origin.png` (`1448x1086`)
- In-app-equivalent viewport: `iab-1346x1185.png`
- Compared panel bounds: `x=63`, `y=135`, `1220x915`
- Side-by-side normalized panel: `comparison-1346x1185.png` (reference, runtime)
- Amplified pixel difference: `pixel-diff-1346x1185.png`
- Mobile scroll evidence: `mobile-top-390x844.png`, `mobile-bottom-390x844.png`
- Reference SHA-256: `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`
- Bundled 2x preservation asset SHA-256: `ee7b9b972382136e5bab7594bc2793420cbb5bda5b23ddc8c025fa4cade5e8fd`

Pixel comparison after resizing the reference to the measured in-app Browser panel on 2026-07-18:

| Region | Mean absolute error | RMSE | Max-channel <= 4 | Max-channel <= 12 |
|---|---:|---:|---:|---:|
| Full panel | 3.032 | 12.795 | 83.28% | 94.86% |
| Left visual | 1.917 | 3.619 | 81.36% | 96.36% |
| Functional auth surface | 4.377 | 18.585 | 85.59% | 93.05% |
| Auth brand crop | 1.349 | 3.691 | 87.47% | 95.35% |

The title alignment reduced its regional mean absolute error from `19.538` to `7.949`. The animated
route overlay was also softened so the left route region fell from `2.638` to `2.330` while retaining
the moving dash contract. Measurements use the visible in-app Browser at `1346x1185`, DPR `2`, with
the runtime panel cropped at `x=63`, `y=135`, `1220x915`.

The left visual and auth brand use the same approved reference pixels through a 2x preservation
asset so DPR 2 rendering does not enlarge the original bitmap directly. The right surface remains
functional DOM: authentication-mode state, validation, provider availability, help requests, locale,
focus, and safe navigation continue to follow the live API contract instead of being baked into the
reference bitmap. At `390x844`, the canvas has `921px` scroll height, `844px` client height, and no
horizontal overflow; the footer is reachable after scrolling.
