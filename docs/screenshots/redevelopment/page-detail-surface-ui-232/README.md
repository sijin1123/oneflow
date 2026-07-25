# UI-232 Page Detail Surface Evidence

- `desktop-1280x720.png`: mocked owner document at the desktop baseline with the
  centered page canvas and collapsed secondary panel.
- `mobile-390x844.png`: the same functional document composition at the mobile
  baseline with zero document-level horizontal overflow.
- `mobile-panel-390x844.png`: the mobile secondary surface opens immediately
  below the fixed frame controls instead of after the long document.
- `iab-runtime-desktop-1280x720.png`, `iab-runtime-mobile-390x844.png`, and
  `iab-runtime-mobile-panel-390x844.png`: local API-backed in-app Browser
  captures used for runtime comparison and containment checks.
- Runtime verification also uses the local API-backed OneFlow project and checks
  breadcrumb, initial saved state, title/body, panel toggle, and responsive
  containment.

The visual structure is reconstructed from reverse-spec D015 through clean-room
OneFlow components. No Plane source, assets, DOM, CSS, packages, or wording are
copied.
