/* Compile-time contract check (PLAN §8/§13) — the hand-written intake types
   must stay assignable to the generated OpenAPI schema, or `tsc` fails. */

import type { components } from '@shared/api-types'

import type { IntakeItem, IntakeList } from './api'

type Schemas = components['schemas']
type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

export type _IntakeItemMatches = Assert<Extends<IntakeItem, Schemas['IntakeRead']>>
export type _IntakeListMatches = Assert<Extends<IntakeList, Schemas['IntakeList']>>
