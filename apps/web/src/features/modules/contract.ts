/* Compile-time contract check (PLAN §8/§13) — the hand-written module types
   must stay assignable to the generated OpenAPI schema, or `tsc` fails. */

import type { components } from '@shared/api-types'

import type { ModuleList, ProjectModule } from './api'

type Schemas = components['schemas']
type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

export type _ModuleMatches = Assert<Extends<ProjectModule, Schemas['ModuleRead']>>
export type _ModuleListMatches = Assert<Extends<ModuleList, Schemas['ModuleList']>>
