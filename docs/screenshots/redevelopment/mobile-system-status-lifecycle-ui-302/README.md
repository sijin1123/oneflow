# UI-302 Mobile System Status Lifecycle

OneFlow runtime captures for the clean-room mobile system status surface.

- `retained-error-320.png`: a failed readiness refresh keeps the last successful checks visible and surfaces the exact retry state in the first viewport.
- `recovered-320.png`: the same refresh command recovers while preserving status facts, safe diagnostics, navigation and the Quick Dock boundary.

The implementation uses OneFlow-owned UI and the existing OneFlow operations status API. It does not copy Plane source, assets, CSS, DOM structure or package code.
