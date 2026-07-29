# UI-303 Mobile User Directory Lifecycle Evidence

OneFlow runtime evidence captured at 320x740 from the current clean-room shell.

- `query-failure-retained-320.png`: a failed `scope=inactive` request keeps the last successful directory, canonical URL and explicit retry in the first content viewport.
- `query-recovered-320.png`: retry repeats the exact inactive request and replaces retained cards only after success; frame actions and Quick Dock remain usable without horizontal overflow.

These images document OneFlow behavior only. They are not copied Plane assets or DOM/CSS evidence.
