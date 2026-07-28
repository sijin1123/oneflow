# UI-281 Project Meeting Detail Composition

- `desktop.png`: writable meeting detail at desktop width with frame save/refresh, title/schedule/recurrence, agenda/minutes, action items and the property/command panel.
- `mobile.png`: the same real meeting at `390x844`; properties and commands lead into the editor without document-level horizontal overflow.
- `loading.png`: initial loading retains the final detail canvas, property rail and frame refresh command.
- `error.png`: initial load failure stays in the same geometry and exposes an in-place retry.

The captures are Playwright runtime evidence from OneFlow-owned mocks and implementation. They do not contain copied Plane source, assets, CSS or DOM.
