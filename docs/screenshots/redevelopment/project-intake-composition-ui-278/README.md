# UI-278 Project Intake Composition

This folder records UI-278 visual verification for the functional project
Intake surface.

- `desktop.png`: compact queue identity, status totals, inline submission,
  status groups, delegated triage actions, and the real frame refresh action.
- `mobile.png`: the same submission and triage surface contained at `390x844`
  without document-level horizontal overflow.
- `loading-mobile.png`: final-geometry status, composer, and queue skeletons.
- `error-mobile.png`: compact independently retryable initial queue error.

The surface uses OneFlow APIs, project membership, archive state, custom-role
`intake.triage` permissions, React Query state, existing tokens, and Lucide
icons. Submission and decision failures retain their exact payload for explicit
retry. Authorization and conflict responses refresh project, member, permission,
and queue state together. Write controls fail closed until every refresh succeeds,
and late refreshes are scoped so one project cannot unlock another project.
No Plane source, package, asset, CSS, DOM hierarchy, exact visual token, wording,
or branding was copied.
