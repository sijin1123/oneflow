# UI-301 Mobile Operations Data Transfer Lifecycle

OneFlow runtime captures for the clean-room mobile Operations surface.

- `retained-error-320.png`: a failed project-scoped transfer request retains the last successful immutable job history and exact retry.
- `recovered-320.png`: the same canonical project scope recovers without losing navigation or transfer metadata.

The implementation uses OneFlow-owned UI and existing OneFlow operations/data-transfer APIs. No Plane source, assets, CSS, DOM structure, or package code is copied.
