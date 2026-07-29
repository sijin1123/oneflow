# Mobile Login Support Query Lifecycle UI-304

- `retained-error-320.png`: a failed `status=resolved` request keeps the last successful support queue, exposes an inline retry, and preserves the current URL at 320x740.
- `recovered-320.png`: retrying the exact request replaces the retained queue with the resolved result while the current-shell actions and Quick Dock remain usable without horizontal overflow.
