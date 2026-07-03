# OneFlow

OneFlow is the company project management system workspace.

This folder is intentionally separate from the upstream reference checkouts:

- `../openproject/` remains the OpenProject reference source.
- `../plane/` remains the Plane reference source.
- `./` is where the OneFlow greenfield product source will be built.

OneFlow's current direction is a clean-room greenfield build. OpenProject is used as a feature reference, while Plane/Linear/GitHub/Notion are used as UI/workflow references. SAP Business One / SAP B1 integration is excluded from scope unless the user explicitly reverses that decision.

Current implementation policies:

- PostgreSQL: local development uses Docker Desktop + Docker Compose; production should use managed or dedicated external PostgreSQL where possible.
- UI: Plane-like experience is the primary target, implemented with OneFlow-owned clean-room React/Tailwind/shadcn components rather than Plane source or packages.
