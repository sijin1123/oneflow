# UI-155 Login pixel audit evidence

- Approved reference: `docs/oneflow-login-origin.png` (`1448x1086`)
- Runtime asset: `apps/web/src/assets/generated/oneflow-login-origin-reference.png`
- Reference/runtime SHA-256: `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`
- Stable comparison viewport: `1448x1086`
- Runtime panel crop: `x=114`, `y=86`, `1220x915`, normalized to `1448x1086`
- In-app Browser evidence: `1455x1259`, DPR 2

Pixel audit before and after UI-155:

| Region | Baseline MAE | Final MAE | Result |
|---|---:|---:|---:|
| Full panel | 2.260 | 2.188 | -3.2% |
| Left visual | 1.231 | 1.231 | unchanged |
| Functional auth surface | 3.504 | 3.344 | -4.6% |
| Auth brand crop | 1.284 | 1.284 | unchanged |
| Heading | 9.571 | 6.652 | -30.5% |
| Password row | 5.018 | 4.950 | -1.4% |
| Divider | 4.440 | 3.782 | -14.8% |

The left watercolor, Kanban card, activity cards, route composition, and both OneFlow brand
lockups continue to render from the exact approved OneFlow bitmap. UI-155 changes only the live
semantic authentication surface: the heading and divider move up one CSS pixel, and the hidden
password state uses an eye with a short lower-right stroke matching the approved icon while keeping
the real password toggle and disabled API state.

Evidence:

- `reference-runtime-comparison.png`: approved reference and normalized runtime side by side
- `reference-runtime-diff-x4.png`: four-times contrast pixel difference
- `../login-origin-fidelity-ui/1448x1086.png`: stable Chromium capture
- `../login-origin-fidelity-ui/390x844.png`: functional responsive capture
- `desktop-in-app-1455x1259.png`: actual in-app Browser capture

Residual differences are confined to the functional DOM surface and include browser font
anti-aliasing, native emoji rendering, and live authentication availability state. The comparison
does not replace controls with a dead screenshot: dev/OIDC behavior, validation, assistance,
locale, safe navigation, password visibility, focus, and reduced-motion remain executable.
