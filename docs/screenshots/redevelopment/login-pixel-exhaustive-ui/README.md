# UI-203 Login Pixel Exhaustive Reinspection

- Visual authority: user-owned OneFlow source `apps/web/src/assets/generated/oneflow-login-origin-reference.png` (`1448x1086`).
- Authority SHA-256: `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`.
- Runtime: functional semantic login DOM at `http://localhost:5173/login`, captured losslessly in Chromium at DPR 1.
- `desktop-1448x1086.png`: API-connected desktop runtime without error or disabled submit state.
- `mobile-390x844.png`: responsive functional runtime with no horizontal or vertical overflow.
- `reference-runtime-side-by-side.png`: authority on the left and runtime on the right.
- `pixel-diff-x8.png`: absolute RGB delta amplified by 8x brightness and 2x contrast.
- `pixel-metrics.json`: fixed-bounds MAE, p95 and maximum channel delta for every major surface.

The full-canvas MAE is `1.3151` with p95 `2`. The story surface is `0.0117`; its brand, headline and Kanban regions are exactly `0.0000`. The auth logo is also exactly `0.0000`. Remaining difference is concentrated in browser-rasterized semantic text, controls and card shadow: auth surface `2.8887`, auth card `3.6821`.

This slice keeps email, password, remember-me, password visibility, sign-in, provider availability, assistance, policy, locale and safe-next controls wired to the existing OneFlow auth contract. It does not replace the form with a screenshot or transparent hit layer.
