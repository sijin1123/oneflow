# Login origin fidelity evidence

- Reference: `docs/oneflow-login-origin.png` (`1448x1086`)
- Runtime capture: `1448x1086.png`
- Compared panel bounds: `x=114`, `y=86`, `1220x915`
- Reference asset SHA-256: `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`
- Bundled asset SHA-256: `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`

Pixel comparison after resizing the reference to the runtime panel:

| Region | Mean absolute error | 95th percentile |
|---|---:|---:|
| Full panel | 3.037 | 8 |
| Left visual | 0.888 | 3 |
| Functional auth surface | 5.630 | 16 |

The right surface intentionally remains functional DOM. Authentication-mode copy, enabled states,
focus, validation, provider availability, and access-request behavior reflect the live API contract
instead of being baked into the reference bitmap.
