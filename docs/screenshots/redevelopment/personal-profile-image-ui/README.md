# UI-200 Personal profile-image lifecycle

- Surface: `/settings` Personal Settings and global Topbar account avatar
- Desktop evidence: `desktop.png` (`1440x900`)
- Mobile evidence: `mobile.png` (`390x844`)
- Functional flow: local preview, bounded PNG/JPEG/WebP upload, immediate `/me` cache and shell reflection, replace, remove, initials fallback, stale revision retry with the selected file preserved
- Backend contract: authenticated self-only `/api/v1/me/profile-image`, strong `If-Match`, versioned private immutable reads, static-image decode validation, atomic local-storage replacement and orphan sweep reference
- Deferred: profile-image propagation to historical member, comment and activity read models is tracked as the next independent identity surface
