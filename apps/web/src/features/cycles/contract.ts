/* Compile-time contract check (PLAN §8/§13) — the hand-written cycle types
   must stay assignable to the generated OpenAPI schema, or `tsc` fails. */

import type { components } from '@shared/api-types'

import type { Cycle, CycleList } from './api'

type Schemas = components['schemas']
type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

export type _CycleMatches = Assert<Extends<Cycle, Schemas['CycleRead']>>
export type _CycleListMatches = Assert<Extends<CycleList, Schemas['CycleList']>>
