# UI-224 Login Origin Pixel Parity

## Comparison method

- Reference: `apps/web/src/assets/generated/oneflow-login-origin-reference.png`
- Runtime capture: Chromium at `1448x1086`, device scale factor 1, reduced motion enabled
- Compact capture: Chromium at `1280x720`; the centered `960x720` login panel is compared with a Lanczos-resized reference
- Metric: RGB mean absolute error (MAE), root mean square error (RMS), and the percentage of pixels whose grayscale difference is greater than 5
- Functional controls remain semantic HTML. The left story and both brand lockups use approved OneFlow source crops, while the right-side form remains interactive and localizable.

## Result

| Region | Baseline MAE | Final MAE | Result |
|---|---:|---:|---|
| Full canvas | 1.8279 | 1.6724 | Improved 8.5% |
| Left story | 0.0122 | 0.0122 | Source-exact apart from the route accent |
| Left brand | 0.0000 | 0.0000 | Pixel exact |
| Kanban card | 0.0000 | 0.0000 | Pixel exact |
| Right brand | 0.0000 | 0.0000 | Pixel exact |
| Auth surface | 4.0200 | 3.6768 | Improved 8.5% |
| Auth footer | 2.8324 | 2.1224 | Improved 25.1% |

The remaining concentrated difference is the anti-aliasing of live HTML text and Lucide control icons against text baked into the reference raster. Replacing the controls with a static screenshot would lower the metric but would remove keyboard, validation, localization, password visibility, dialog, and provider behavior, so it is intentionally not used.

## Evidence

- `baseline-desktop-1448x1086.png`: final source-coordinate runtime capture
- `baseline-compact-1280x720.png`: final in-app-sized runtime capture
- `baseline-mobile-390x844.png`: final mobile runtime capture
- `final-diff-x12.png`: final absolute pixel difference, amplified 12x
- `baseline-metrics.json`: measurements before UI-224 color calibration
- `final-metrics.json`: measurements after UI-224 color calibration
- `in-app-live-1280x720.jpg`: screenshot from the Codex in-app browser after switching port 5173 to this branch
- `in-app-origin-1448x1086.jpg`: approved origin as displayed in the in-app browser

## Functional verification

`login-pixel-ui224.spec.ts` verifies exact desktop geometry, the centered compact frame, mobile horizontal overflow, validation focus, password reveal, dialog Escape dismissal, and language switching.
