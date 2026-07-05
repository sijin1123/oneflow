/* Compile-time contract checks (PLAN §8/§13) — hand document types must stay
   assignable to the generated OpenAPI schema, or `tsc` fails. */

import type { components } from '@shared/api-types'

import type { DocumentListItem, ProjectDocument } from './api'

type Schemas = components['schemas']
type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

export type _DocumentMatches = Assert<Extends<ProjectDocument, Schemas['DocumentRead']>>
export type _DocumentListItemMatches = Assert<
  Extends<DocumentListItem, Schemas['DocumentListItem']>
>
