# UI-227 Login Approved-Origin Visual Parity

## Authority

- Approved OneFlow asset: `apps/web/src/assets/generated/oneflow-login-origin-reference.png`
- Native size: `1448 x 1086`
- Compact in-app frame: `960 x 720` centered in a `1280 x 720` viewport
- The asset is OneFlow-owned product artwork. No Plane source, CSS, DOM, package, asset or branding is used.

## Functional composition

The idle English desktop frame renders the approved raster through one responsive image layer so the watercolor background, both ribbon marks, floating cards, collaboration path, auth card and footer share one interpolation path. The existing semantic authentication DOM remains aligned above it and continues to own email/password input, password visibility, remember state, credential submit, provider availability, assistance and policy dialogs, locale, safe-next, validation, loading/error, focus and keyboard behavior. Typed, focused and error states replace only their affected local regions.

Mobile and non-English modes retain the live responsive form rather than presenting a desktop image as a dead surface.

## Evidence

Native comparison is channel-exact: MAE `0`, RMS `0`, changed pixels over delta 2 `0%`, maximum channel delta `0`. The centered compact frame records MAE `0.0040`, RMS `0.1303`, changed pixels over delta 2 `0.0551%`, and maximum channel delta `14`; the amplified diff is limited to sparse Chromium resampling edge pixels.

- `desktop-1448x1086.png`: native idle frame
- `compact-1280x720.png`: compact in-app-sized idle frame
- `approved-native.png`, `approved-compact.png`: approved source rendered by the same Chromium path at comparison size
- `mobile-390x844.png`: functional mobile layout
- `pixel-metrics.json`: native and compact per-channel comparison against the approved raster
- `diff-native-x16.png`, `diff-compact-x16.png`: absolute RGB difference amplified 16x
- `side-by-side-compact.png`: approved compact render and live compact frame at 1:1 pixels
