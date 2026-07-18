# Login origin fidelity evidence

- Approved reference: `docs/oneflow-login-origin.png` (`1448x1086`)
- Bundled runtime asset: `apps/web/src/assets/generated/oneflow-login-origin-reference.png`
- Reference/runtime asset SHA-256: `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`
- Compared Chromium viewport: `1448x1086`
- Compared panel bounds: `x=114`, `y=86`, `1220x915`
- Side-by-side normalized panel: `comparison-1448x1086.png` (reference, runtime)
- Amplified pixel difference: `pixel-diff-1448x1086.png`
- Responsive evidence: `1024x768.png`, `1280x720.png`, `1366x768.png`, `1440x900.png`,
  `1448x1086.png`, `1920x1080.png`, `390x844.png`, `768x1024.png`, `desktop.png`, and
  `mobile.png`

Pixel comparison against the measured runtime panel on 2026-07-18:

| Region | Mean absolute error | RMSE | Max-channel <= 4 | Max-channel <= 12 |
|---|---:|---:|---:|---:|
| Full panel | 2.016 | 10.704 | 92.33% | 97.02% |
| Left visual | 0.907 | 2.793 | 95.65% | 98.83% |
| Functional auth surface | 3.413 | 15.781 | 88.15% | 94.75% |
| Auth brand crop | 0.993 | 3.272 | 94.17% | 97.61% |

The exact approved bitmap now drives the watercolor field and both brand lockups. Measurements use a
stable Chromium viewport at `1448x1086`, with the runtime panel cropped to `1220x915`. The right-side
form remains functional DOM, so anti-aliasing, native emoji, and browser form rendering account for
most residual pixels.

The approved OneFlow reference is a user-owned product asset and is stored byte-for-byte at its
natural resolution. Plane/OpenProject source, packages, CSS, DOM, branding, and assets are not used.
Authentication-mode state, validation, provider availability, help requests, locale, password
visibility, focus, and safe navigation continue to follow the live API contract instead of being
baked into the reference bitmap. At `390x844`, the page switches to a single-column auth surface with
reachable footer content and no horizontal overflow.
