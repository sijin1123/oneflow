# UI-140 Login CSS consolidation evidence

UI-140 removes historical login illustration selectors and override layers while preserving the merged UI-139 login result and functional authentication controls.

## Captures

| Viewport | Before | After | MAE | P95 |
|---|---|---|---:|---:|
| 1280x720 | `before-1280x720.png` | `after-1280x720.png` | 0.008264 | 0 |
| 1448x1086 | `before-1448x1086.png` | `after-1448x1086.png` | 0.004885 | 0 |
| 390x844 | `before-390x844.png` | `after-390x844.png` | 0.001050 | 0 |

The tiny non-zero desktop delta is limited to subpixel/animated route rendering between independent captures. Geometry is unchanged at 1280x720: the panel remains `896x672` at `(192, 24)`, horizontal overflow is zero, and the authentication card remains `clientHeight=scrollHeight=549`.

## Consolidation

- CSS rules: 487 to 237
- declarations: 1,470 to 722
- keyframes: 11 to 6
- source size: 52,260 to 26,980 bytes
- removed legacy selectors: Kanban, calendar, activity, project progress, story copy, collaboration, and obsolete logo internals no longer rendered by `LoginPage.tsx`

The reference asset, credential/OIDC behavior, assistance dialogs, policy notices, locale menu, validation, focus handling, safe-next redirect, responsive layout, and reduced-motion behavior remain in scope for regression verification.
