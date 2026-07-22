# UI-222 Login In-App Pixel Parity Evidence

## Scope

- Runtime: `http://localhost:5173/login`
- Browser viewport: `1280 x 720`, DPR 1
- Runtime product frame: `(160, 0) - (1120, 720)`, `960 x 720`
- Reference: approved `oneflow-login-origin-reference.png`, resized from `1448 x 1086` to `960 x 720` with Lanczos filtering
- Mobile regression: `390 x 844`

The left visual remains an approved clean-room OneFlow asset. The browser selects the exact `525 x 720` derivative at the in-app viewport, avoiding a second runtime resize. Asset hashes are pinned by `loginAssets.test.ts`.

## Pixel Audit

Mean absolute RGB-channel error (lower is better):

| Region | Before | After | Improvement |
|---|---:|---:|---:|
| Full product frame | 4.3606 | 3.7411 | 14.21% |
| Story visual | 3.8797 | 3.8052 | 1.92% |
| Authentication surface | 4.9409 | 3.6638 | 25.85% |
| Authentication heading | 19.9190 | 7.2480 | 63.61% |
| Submit button | 14.6003 | 6.3755 | 56.33% |
| Provider buttons | 10.9743 | 9.4662 | 13.74% |

Detailed bounds, percentiles, maxima, and threshold coverage are stored in `pixel-metrics.json`.

## Visual Findings

- The watercolor landscape, S-shaped river, upper orbit decorations, foreground plant, floating cards, collaboration route, story logo, and story copy now use the approved composition without CSS reconstruction.
- The in-app story source is `oneflow-login-story-reference-525x720.png`; the `1440 x 900` surface selects the `667 x 915` derivative, and the reference-size surface selects the `792 x 1086` source.
- The authentication heading, emoji, subtitle, option row, submit button, provider labels, and footer were realigned at the final responsive size. Controls remain live and keyboard accessible.
- The remaining high-frequency difference is concentrated on text and one-pixel edges. It reflects browser font rasterization and source-image resampling rather than missing content or changed geometry.
- The mobile layout keeps the reference logo/top decoration as a compact header, exposes every authentication control, and has no horizontal overflow.

## Evidence

- `before-in-app-1280x720.png`: pre-correction in-app capture
- `after-in-app-1280x720.png`: final in-app capture
- `reference-panel-960x720.png`: normalized approved reference
- `reference-vs-after-1920x720.png`: reference on the left, runtime on the right
- `absolute-diff-x6.png`: absolute RGB difference amplified 6x
- `mobile-390x844.png`: responsive runtime capture
