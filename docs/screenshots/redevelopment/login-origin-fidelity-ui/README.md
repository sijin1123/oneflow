# Login origin fidelity evidence

- Reference: `docs/oneflow-login-origin.png` (`1448x1086`)
- In-app-equivalent viewport: `iab-1346x1185.png`
- Compared panel bounds: `x=63`, `y=135`, `1220x915`
- Side-by-side normalized panel: `comparison-1346x1185.png` (reference, runtime)
- Amplified pixel difference: `pixel-diff-1346x1185.png`
- Mobile scroll evidence: `mobile-top-390x844.png`, `mobile-bottom-390x844.png`
- Reference SHA-256: `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`
- Bundled 2x preservation asset SHA-256: `ee7b9b972382136e5bab7594bc2793420cbb5bda5b23ddc8c025fa4cade5e8fd`

Pixel comparison after resizing the reference to the measured runtime panel:

| Region | Mean absolute error | RMSE | Max-channel <= 4 | Max-channel <= 12 |
|---|---:|---:|---:|---:|
| Full panel | 2.330 | 13.358 | 93.29% | 97.11% |
| Left visual | 0.736 | 2.141 | 97.65% | 99.64% |
| Functional auth surface | 4.259 | 19.719 | 88.01% | 94.05% |
| Auth brand crop | 0.864 | 2.324 | 94.25% | 98.98% |

The left visual and auth brand use the same approved reference pixels through a 2x preservation
asset so DPR 2 rendering does not enlarge the original bitmap directly. The right surface remains
functional DOM: authentication-mode state, validation, provider availability, help requests, locale,
focus, and safe navigation continue to follow the live API contract instead of being baked into the
reference bitmap. At `390x844`, the canvas has `921px` scroll height, `844px` client height, and no
horizontal overflow; the footer is reachable after scrolling.
