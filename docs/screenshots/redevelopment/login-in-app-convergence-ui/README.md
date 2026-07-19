# UI-160 in-app login convergence evidence

- Approved source and runtime asset SHA-256: `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`
- In-app desktop viewport: `1448x1086`
- Compact panel: `1220x915` at `x=114`, `y=85.5`
- Desktop split: `54.7% / 45.3%`
- Mobile viewport: `390x844`, horizontal overflow `0`

The approved OneFlow bitmap remains unchanged and supplies the full watercolor story surface and
both brand crops. The regression was caused by the desktop authentication card's three-pixel
vertical overflow: the in-app browser displayed a narrow scrollbar that consumed about eleven
pixels of content width and shifted the live logo, heading, inputs, and actions left by five to six
pixels. UI-160 keeps the card scrollable for functional error and OIDC states but makes the scrollbar
non-layout-taking across engines.

Measured against the same in-app capture before and after the correction:

| Region | Before MAE | Final MAE | Change |
|---|---:|---:|---:|
| Full panel | 3.950 | 3.253 | -17.6% |
| Watercolor story | 2.921 | 2.923 | unchanged |
| Functional auth surface | 5.192 | 3.651 | -29.7% |
| Auth brand | 12.336 | 2.533 | -79.5% |

The residual story delta is browser resampling at the half-pixel centered panel boundary; the
runtime and approved source are byte-identical. The right surface remains semantic, functional DOM,
so font anti-aliasing and native emoji rendering are intentionally not replaced by dead pixels.

Evidence:

- `desktop-in-app-1448x1086.png`: final API-ready in-app desktop capture
- `mobile-in-app-390x844.png`: final reachable mobile viewport capture
- `reference-runtime-comparison.png`: approved source and normalized runtime side by side
- `reference-runtime-diff-x4.png`: four-times contrast residual difference
