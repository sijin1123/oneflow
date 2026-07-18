# UI-141 Customer Tags Verification

## Surface

- Customer create/update persists normalized workspace-internal tags.
- Customer cards expose tags as exact-match filter controls.
- The shared filter select lists tags without adding an external CRM dependency.
- Workspace admins can write; authenticated members keep the existing read-only customer access.

## Evidence

- `desktop.png`: `1440x900`, live API and PostgreSQL after migration `0105`.
- `mobile.png`: `390x844`, live API and PostgreSQL.
- Horizontal overflow measured as `0px` in both viewports.
- Live edit added `strategic`; the exact tag filter returned the matching customer.

## Contract

- Up to 12 tags per customer, each up to 32 characters.
- Values are trimmed, Unicode case-folded, deduplicated, and stored as JSONB.
- API and UI reject blank, oversized, null-update, and over-limit values.
- External CRM synchronization and arbitrary customer custom-property schemas remain outside this slice.
