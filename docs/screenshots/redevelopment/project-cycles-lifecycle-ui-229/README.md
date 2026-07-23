# UI-229 Project Cycles lifecycle surface evidence

## Surface

- Route: `/projects/:projectId/cycles`
- Desktop viewport: `1280x720`
- Mobile viewport: `390x844`
- Reference: `docs/plane-poc-reverse-spec/assets/screenshots/desktop/D012-projects-708a1f56-2f57-4fc9-9786-88ab3e900a0b-cycles-active.png`

## Acceptance evidence

- `desktop.png`: the large explanatory header, duplicate planning-mode navigation, four-card summary and persistent create form are absent. Lifecycle tabs, selected cycle progress/date/work-item action, owner menu and burndown form the primary surface.
- `mobile.png`: the same selected-cycle surface stacks summary and burndown without document-level horizontal overflow.
- Active/Upcoming/Completed and search are URL-backed; direct state/query navigation produces truthful status-specific empty results.
- Owner create uses a focus-trapped dialog backed by the existing cycle POST. Member users do not receive create/edit/delete actions.
- Selected cycle work-item navigation, edit, delete, rollover and burndown remain real controls on existing API contracts.

## Verification

- Focused owner lifecycle/create/action/burndown E2E: `1/1` PASS.
- Focused member/mobile containment E2E: `1/1` PASS.
- Affected cycle regression: `5/5` PASS.
- Full E2E: `369` PASS, `1` intentional skip; five unrelated parallel timing failures all passed immediately with one worker.
- Typecheck PASS; lint PASS with four pre-existing Fast Refresh warnings; unit `108/108`; component `9/9`; production build PASS.
- Clean-room gate PASS (`161` frontend and `45` backend packages).
- Real API-ready in-app runtime: empty lifecycle state, owner Add cycle dialog focus lifecycle and desktop containment PASS.
- `npm audit --omit=dev --audit-level=high` reports the unchanged repository baseline of 38 vulnerabilities rooted mainly in legacy `@ui5/cli` and `axios`; this branch changes no manifest or lockfile.
- PR CI and main integration remain pending.
