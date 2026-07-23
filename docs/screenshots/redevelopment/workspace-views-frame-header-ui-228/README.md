# UI-228 Workspace Views frame header evidence

## Surface

- Route: `/work-items`
- Desktop viewport: `1280x720`
- Mobile viewport: `390x844`
- Reference: `docs/plane-poc-reverse-spec/11-focused-sidebar-views-observations.md`

## Acceptance evidence

- `desktop.png`: one 44px central frame header contains scope/count, Board/Calendar/Table/Timeline, filter count, analytics, Display, saved views, Add view and refresh. The previous duplicate page header and persistent search toolbar are absent.
- `mobile.png`: the same functional controls wrap into two stable action rows without document-level horizontal overflow.
- Search remains URL-backed and is revealed inside the animated filter/PQL panel. A non-empty `q` value contributes to the filter count and opens the panel on direct navigation.
- The frame keeps a semantic `h1` for assistive technology while the visible page identity comes from the shared frame context bar.
- Saved-view loading/error/retry, create/update/revert/delete, layout switching, filter/PQL, Display, analytics and refresh remain real controls. No API, DB, permission, migration or environment change is required.

## Verification

- Typecheck: PASS
- Lint: PASS with four pre-existing Fast Refresh warnings
- Unit: `108/108` PASS
- Component: `9/9` PASS
- Build: PASS
- Focused UI-228 E2E: `1/1` PASS
- Affected Workspace Views E2E: `23/23` PASS
- Full E2E attempt 1: `372` PASS, `1` intentional design-manifest skip, `1` unrelated overview retry timing failure; the failed case passed immediately in isolation (`1/1`).
- Full E2E attempt 2: `372` PASS, `1` intentional design-manifest skip, `1` unrelated mobile team screenshot timeout; the failed case passed immediately in isolation (`1/1`). The overview case from attempt 1 also passed in this run.
- Clean-room: PASS (`161` frontend packages, `45` backend packages, no suspicious reference overlap)
- Dependency audit: PASS (`0` vulnerabilities)
- PR CI and main integration: pending at branch evidence capture time
