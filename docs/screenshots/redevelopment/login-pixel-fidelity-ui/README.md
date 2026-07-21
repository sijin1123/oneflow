# UI-196 Login Pixel Fidelity Exhaustive Reinspection

## Authority and geometry

- Visual authority: the user-owned OneFlow asset `docs/oneflow-login-origin.png`.
- Approved origin SHA-256: `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`.
- Runtime origin SHA-256: `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`.
- Desktop viewport: `1448x1086`; runtime panel: `(114, 86) 1220x915`.
- Comparison geometry: approved origin normalized to `1220x915` and compared channel-by-channel with the lossless Chromium panel crop.

The runtime story image and auth logo are deterministic crops of the approved origin. Their source-level MAE is `0.0000`; there is no alternate background painting or reconstructed logo in this surface.

## Exhaustive result

| Region | UI-194 MAE | UI-196 MAE | Delta <= 8 | p95 |
|---|---:|---:|---:|---:|
| Full panel | 1.4090 | **1.3402** | 97.68% | 3 |
| Story | 0.0149 | **0.0146** | 99.95% | 0 |
| Auth | 3.0904 | **2.9391** | 94.93% | 9 |
| Story brand | 0.0000 | **0.0000** | 100.00% | 0 |
| Headline | 0.0000 | **0.0000** | 100.00% | 0 |
| Kanban | 0.0000 | **0.0000** | 100.00% | 0 |
| Calendar | 0.0000 | **0.0000** | 100.00% | 0 |
| Auth logo | 0.0000 | **0.0000** | 100.00% | 0 |

The remaining auth-side delta is concentrated in Chromium's semantic text/icon rasterization. UI-196 narrows it with measured heading and provider weight, label width, CTA color, and tall-desktop footer alignment changes while preserving real controls and event handlers.

## Evidence

- `desktop-1448x1086.png`: lossless final Chromium desktop capture.
- `mobile-390x844.png`: final functional mobile capture.
- `in-app-1280x720.jpg`: final Codex in-app browser capture.
- `reference-normalized-1220x915.png`: normalized authority image.
- `runtime-panel-1220x915.png`: exact runtime panel crop.
- `side-by-side.png`: authority and runtime panel comparison.
- `diff-x8.png`: amplified channel delta.
- `pixel-metrics.json`: complete region boxes and measurements.

Desktop, in-app, and mobile states have no horizontal overflow. Email, password visibility, remember-me, sign-in, configured providers, assistance, policy, locale, validation, and safe-next behavior remain semantic, keyboard-operable controls; no screenshot overlay or dead control is used.
