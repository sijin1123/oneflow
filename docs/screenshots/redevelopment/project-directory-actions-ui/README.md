# UI-195 Project Directory Functional Actions

- `desktop-card-menu.png`: 1280x720 Chromium capture of the project directory card actions. It verifies the direct favorite state, same-tab sidebar synchronization, owner-only archive action, and absence of an unimplemented publish control.
- `mobile-list-menu.png`: 390x844 Chromium capture after archive, restore, and list-layout transition. It verifies the list action menu, restored project state, feedback status, and no horizontal overflow.

Both captures come from the functional Playwright flow in `apps/web/e2e/smoke.spec.ts`; the underlying project, membership, clipboard, archive, and unarchive requests are asserted in the same scenario.
