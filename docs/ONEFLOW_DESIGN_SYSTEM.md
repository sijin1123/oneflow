# OneFlow Precision Design System

Status: implemented foundation, 2026-07-11

Source: `apps/web/src/index.css`, `apps/web/src/components/ui/`

Clean-room input: `../docs/plane-poc-reverse-spec/` behavior, information architecture, density, and interaction observations only

## Product character

OneFlow is an internal operating surface for people who revisit projects all day. The interface is calm, compact, exact, and warm enough to feel considered. Information and state lead; decoration appears only in rare empty moments.

The visual language is original to OneFlow:

- Cool porcelain canvas and graphite text create a quiet work surface.
- Mineral green marks action, selection, and forward motion.
- Muted coral marks destructive or urgent states.
- Restrained violet, gold, and green broaden information, warning, and success semantics.
- Borders establish hierarchy. Shadows are reserved for floating layers.

## Tokens

### Color

| Role | CSS token | Use |
|---|---|---|
| Canvas | `--of-bg` | Application background and section breathing room |
| Surface | `--of-surface`, `--of-surface-raised` | Main content and elevated chrome |
| Muted surfaces | `--of-surface-2`, `--of-surface-3` | Controls, grouped rows, skeletons |
| Interaction | `--of-surface-hover`, `--of-surface-selected` | Hover/focus-within and selected navigation/rows |
| Borders | `--of-border-subtle`, `--of-border`, `--of-border-strong` | Dividers, controls, high-emphasis outlines |
| Text | `--of-text`, `--of-text-secondary`, `--of-text-muted`, `--of-text-faint` | Four information tiers |
| Accent | `--of-accent*` | Primary commands, selection, focus-adjacent emphasis |
| Semantic | `--of-info*`, `--of-success*`, `--of-warning*`, `--of-danger*` | System feedback and status |
| Priority | `--of-priority-low/medium/high/urgent` | Priority text and indicators |

State must never rely on color alone. Status chips combine label and dot; priority always includes its written label; alerts include text and role semantics.

Semantic mapping:

| Domain value | Visual token pair |
|---|---|
| backlog / canceled | faint or strong-border dot + written status |
| todo | info + written status |
| in progress | warning + written status |
| in review | accent + written status |
| done | success + written status |
| priority none / low / medium / high / urgent | muted / priority-low / priority-medium / priority-high / danger plus written label |
| health on-track / at-risk / off-track | success / warning / danger plus written health label |
| disabled | muted text, surface-2 background, 45-50% opacity, native disabled semantics |

### Typography

- Family: Pretendard Variable, Pretendard, platform sans fallbacks.
- Body: 14px/1.5. Dense table labels: 11-12px. Compact commands: 12px. Page titles: 15-16px.
- Weight: 400 body, 500 controls/labels, 600 headings and decisive values.
- Letter spacing is always `0`. Hero-scale typography is not used in operational surfaces.
- Tabular numbers are used for counts, revisions, dates, and progress metrics.

### Shape, shadow, and surface

- Radius: 4px small internals, 6px controls, 8px panels and overlays.
- `--of-shadow-xs`: tactile controls and stable low elevation.
- `--of-shadow-sm`: raised panels only.
- `--of-shadow-popover`: command palette, menus, sheets, and mobile rail.
- Never nest decorative cards. Sections remain unframed; cards are reserved for repeatable records or true panels.

### Density and dimensions

| Contract | Compact | Comfortable |
|---|---:|---:|
| Controls | 28px | 32px |
| Data rows | 36px | 44px |
| Topbar | 52px | 52px |
| Sidebar | 240px | 240px |

`DataGridFrame` owns density through `data-density`. On coarse pointers, `.of-touch-target` expands interactive targets to at least 44x44px without changing desktop density.

### Motion and focus

- Fast control feedback: 120ms. Standard state changes: 180ms. Overlays: 220ms.
- Standard easing is `cubic-bezier(0.2, 0, 0, 1)`; emphasized overlay easing is reserved for entrance/exit.
- `prefers-reduced-motion: reduce` collapses animation and transition durations.
- Focus is a 2px mineral ring with 2px offset. Focus must not be removed without an equivalent visible replacement.

### Responsive behavior

- Desktop shows the 240px rail. Below `md`, navigation becomes a modal side rail with backdrop.
- Toolbars wrap commands; data tables scroll inside a labeled local region instead of widening the shell.
- Settings navigation becomes horizontal and scrollable before switching to a vertical rail on large screens.
- Detail properties precede content on small screens and become a sticky right rail on large screens.
- Text truncates only where the full value remains available by title, detail view, or accessible name.

## Foundation primitives

| Primitive | Contract |
|---|---|
| `Button` | default, secondary, outline, ghost, danger, subtle-danger; sm/default/lg/icon sizes |
| `IconButton` | required accessible label and tooltip title; default/danger tones |
| `Badge` | neutral, accent, outline, info, success, warning, danger |
| `Avatar` / `AvatarGroup` | deterministic initials, optional image, named accessible output |
| `Input`, `Select`, `Textarea` | native semantics, stable disabled/read-only/error-ready surfaces |
| `Checkbox`, `Switch`, `Toggle` | explicit binary state and accessible label contracts |
| `SegmentedControl` | controlled single-choice radiogroup for view/density modes |
| `Tooltip` | descriptive, non-interactive hover/focus label |
| `Surface` | flat, raised, and floating surface hierarchy |
| `PageHeader`, `Toolbar` | compact page anatomy with stable responsive wrapping |
| `DataGridFrame`, `DataGrid`, `DensityControl` | semantic table, local scroll boundary, compact/comfortable density |
| `PropertyRow` | stable label/value definition-list anatomy |
| `InlineAlert` | info, success, warning, danger, and neutral status surfaces |
| Radix Dropdown/Sheet | focus-aware menu and modal drawer behavior |

Interactive data tables remain semantic HTML tables. Links, checkboxes, and buttons own focus; OneFlow does not impose spreadsheet arrow-key behavior on ordinary work lists.

### Inventory status

| Requested category | Status in this implementation |
|---|---|
| Button, IconButton, Badge, Tooltip, SegmentedControl, Switch, Checkbox, Toggle, Avatar/stack, Panel/Surface, Toolbar, PageHeader, InlineAlert, DataGrid shell | Shared primitive added or upgraded |
| StatusChip, PriorityChip, PropertyChip | Existing work-package chips upgraded to semantic OneFlow tokens; property chips remain product-typed aliases |
| HealthChip | Existing `ProjectHealthBadge` behavior retained and mapped to success/warning/danger; shared extraction backlogged until a second non-project consumer exists |
| DropdownMenu, Sheet/Drawer, Dialog behavior | Existing Radix menu/dialog foundation retained and visually upgraded; Sheet is the shared modal-dialog wrapper |
| Popover | Backlogged: current action sets use accessible DropdownMenu and static information uses Surface; add Radix Popover only with a real interactive anchored-panel consumer |
| Tabs | Existing controlled SettingsTabList and detail tabs retained; generic extraction backlogged until keyboard roving behavior can replace both without regressions |
| Input, Textarea, Select, DateField | Shared fields upgraded; current date controls intentionally remain native `input[type=date]`; named wrapper backlogged until validation duplication appears |
| CommandPalette | Existing product component upgraded with combobox/listbox semantics, focus wrap/return, and responsive visual QA |
| Kbd | Backlogged: operational UI does not show shortcut-instruction text; `aria-keyshortcuts` remains the accessible contract |
| EmptyState, Skeleton | Existing state primitives upgraded; illustration is opt-in |
| Toast / notification | Existing mutation-local status/alert and notification center retained; global provider backlogged to avoid duplicate announcements and hidden action failures |
| DataRow, PropertyCell, PropertyEditor | Semantic table rows/cells and existing detail form editors retained; shared DataGrid/PropertyRow anatomy added without forcing spreadsheet semantics |

Backlogged abstractions are intentional non-goals for this PR. They are not represented by dead controls, speculative dependencies, or incomplete providers.

## Product patterns

### Shell and navigation

`AppShell`, `Sidebar`, and `Topbar` use the shared shell dimensions and border hierarchy. Active navigation uses the selected surface plus accent text. Functional icons come from `lucide-react`; the OF mark remains code-native text.

### Command palette

The command palette opens from the global shortcut layer or search command. It provides a combobox, tabbed scope, listbox results, arrow selection, Enter activation, Escape close, wrapped Tab focus, focus return, loading/error/empty results, and a route to advanced search.

### Display menu and work lists

The project work-list display menu consolidates sort, compact/comfortable density, built-in columns, and bounded custom columns. `DataGridFrame` confines horizontal scroll. Row selection remains native checkbox behavior; destructive and bulk commands remain permission-gated.

### Work-item detail

Full page and drawer share the same detail content. The shell provides a compact page header, overview/activity tabs, a readable content column, and a responsive property rail. Viewers receive a visible read-only notice and do not see mutation commands.

### Settings

Workspace settings groups navigation by management, features, and developer tools. Project settings uses a controlled tab shell for general, membership, workflow, milestones, fields, automation, storage, and danger. Destructive surfaces use coral borders/backgrounds and retain explicit confirmation plus server authorization.

## State language

| State | Visual and behavior |
|---|---|
| Empty | Icon for routine absence; generated illustration only for high-value first/zero-result moments, with adjacent text carrying meaning |
| Loading | Stable row skeletons with shimmer and `aria-busy`; no layout jump |
| Error | Coral-tinted bounded alert, concise message, request ID when present, explicit retry |
| Read-only | Neutral lock notice explaining why mutation controls are absent |
| Success | Mineral/green confirmation with persistent text when an action needs acknowledgement |
| Warning | Gold-tinted surface with action consequence in text |
| Destructive | Coral command and bounded danger surface; confirmation before irreversible or broad-impact action |

## Asset policy

Generated raster assets are optional atmosphere, never icons, controls, status meaning, or data. Every asset requires path, dimensions, prompt, generation workflow, intended use, accessibility treatment, and clean-room provenance in `docs/ONEFLOW_GENERATED_ASSETS.md`.

## Migration rules

- Current `of-*` token aliases and primitive props remain compatible.
- New variants and layout primitives are opt-in; no legacy API is removed in this implementation.
- Representative surfaces establish patterns for future page-by-page migration.
- Every migration must pass TypeScript, relevant component/E2E tests, mobile overflow checks, and clean-room verification.

## Non-goals and follow-up

- No dark theme, customer branding/theme editor, or runtime token customization.
- No generic spreadsheet grid, virtualized row engine, or arrow-key cell navigation.
- No new global overlay dependency solely to rename existing accessible menu/sheet behavior.
- No broad rewrite of document, meeting, file, board, or AI feature logic; their existing UI-60 shells continue to consume compatible `of-*` tokens and are covered by full E2E.
- Future extraction candidates are the inventory items explicitly marked backlogged above; extract only when a concrete second consumer removes duplication.
