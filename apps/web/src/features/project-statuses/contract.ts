/* Compile-time contract check (PLAN §8/§13) — the hand-written ProjectStatus type
   must stay assignable to the generated OpenAPI schema, or `tsc` fails. */

import type { components } from '@shared/api-types'

import type { ProjectStatus } from './api'

type Schemas = components['schemas']
type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

export type _ProjectStatusMatches = Assert<Extends<ProjectStatus, Schemas['ProjectStatusRead']>>
