# Third-Party Notices

OneFlow is a proprietary product (see LICENSE). It bundles and depends on
third-party open-source software licensed under permissive licenses. This file
acknowledges those components; their copyright notices and full license texts are
carried in each package's own distribution.

No GPL / AGPL / SSPL (copyleft) dependency is used. The clean-room gate
(`scripts/check_cleanroom.sh`) enforces an allowed-license family list and fails on
any unknown or copyleft license. The authoritative, exhaustive dependency lists are
the lockfiles:

- Backend: `apps/api/uv.lock` (regenerate a license report with
  `cd apps/api && uv run --with pip-licenses pip-licenses`).
- Frontend: `apps/web/package-lock.json` and `packages/shared/package-lock.json`
  (report with `npx license-checker --production`).

## Principal dependencies and their licenses

### Backend (Python)

| Package | License |
|---|---|
| FastAPI, Starlette | MIT / BSD-3-Clause |
| SQLAlchemy, Alembic | MIT |
| asyncpg | Apache-2.0 |
| Pydantic, pydantic-settings | MIT |
| uvicorn | BSD-3-Clause |
| nh3 (HTML sanitizer) | MIT |
| httpx, click, idna, python-dotenv | BSD-3-Clause |
| pytest, pytest-asyncio, pytest-randomly, ruff | MIT / Apache-2.0 |
| certifi | MPL-2.0 (unmodified, file-level) |

### Frontend (JavaScript/TypeScript)

- **dhtmlx-gantt 10.0.0** — MIT (Community Edition; © XB Software). NOTE:
  versions **9.x and below are GPL-2.0** — the dependency is pinned to the
  exact MIT release and the cleanroom license gate fails closed on any GPL
  resolution, so a downgrade or future license drift cannot land silently.

| Package | License |
|---|---|
| React, React DOM, React Router | MIT |
| @tanstack/react-query | MIT |
| Tiptap (@tiptap/*, free tier only — no @tiptap-pro) | MIT |
| Tailwind CSS | MIT |
| @radix-ui/* | MIT |
| lucide-react | ISC |
| class-variance-authority | Apache-2.0 |
| clsx, tailwind-merge | MIT |
| Vite, Vitest, @testing-library/*, jsdom | MIT |
| Playwright, TypeScript | Apache-2.0 |
| oxlint | MIT |
| openapi-typescript (packages/shared) | MIT |

If OneFlow is ever distributed outside the company, generate a complete
per-package NOTICE bundle from the reports above and include it with the build.
