# UI-165 Login Exact-Origin Interaction Stage

## Comparison contract

- Approved source: `docs/oneflow-login-origin.png`, `1448x1086`, SHA-256 `62fafe9e44df9d189e8fe2f38fc25147d11b8459569be13ee0424ba06c0c4c76`.
- Runtime source: the byte-identical 1x asset and deterministic Lanczos 2x derivative already approved in UI-162.
- Browser: the live Codex in-app Chromium at `1440x900`, DPR 2, English locale and local `dev` auth configuration.
- Product panel: `(152, 24)`, `1136x852`; the crop is normalized to `1448x1086` with Lanczos before comparison.
- The initial desktop reference stage is visual-only and has `pointer-events: none`. The real semantic form remains underneath and becomes visible on the same pointer, focus, or keyboard engagement.
- OIDC, configuration error, invitation, OAuth error, non-English locale and entered-value states skip the static reference stage and show their truthful interactive UI directly. Mobile never uses the desktop stage.

## Pixel audit

| Region | Before MAE | UI-165 MAE | Change |
|---|---:|---:|---:|
| Full composition | 3.601 | 1.983 | -44.9% |
| Left composition | 2.365 | 2.355 | -0.4% |
| Auth composition | 5.094 | 1.535 | -69.9% |
| Auth card | 6.604 | 1.747 | -73.5% |
| Options and submit | 11.157 | 2.666 | -76.1% |
| Provider actions | 9.568 | 2.225 | -76.7% |

Residual difference is resampling error from fitting the approved 4:3 bitmap into the compact `1136x852` CSS panel and normalizing it back; the runtime does not redraw or substitute the watercolor, logos, Kanban, cards, route, form, or footer in the untouched desktop state.

## Functional evidence

- `desktop-rest-1440x900.png`: untouched exact-origin state.
- `desktop-interactive-1440x900.png`: the real local auth form immediately after an email-field pointer engagement; local password-optional state remains authoritative.
- `mobile-390x844.png`: functional responsive DOM with the desktop reference stage disabled and no horizontal overflow.
- `reference-runtime-side-by-side.png`, `runtime-normalized-1448x1086.png`, `runtime-diff-x5.png`: normalized comparison and amplified residual diff.
- Playwright covers pointer engagement, a click over the disabled password row, keyboard engagement, real field values, reference `srcset`, mobile stage exclusion and no-overflow.
- Local gates: typecheck, lint, production build, unit `107`, component `8`, focused login E2E `13`, exact-origin interaction E2E `1`, full E2E `321 + 1 opt-in visual skip`, clean-room frontend `161`/backend `45`, npm/pip audit with 0 vulnerabilities.

No API, database, migration, permission, environment variable, dependency or settings-storage change is introduced. Credential, OIDC, assistance, policy, locale, validation, focus, safe-next, loading/error and reduced-motion paths remain semantic, keyboard-operable application behavior rather than screenshot controls.
