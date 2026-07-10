/* Compile-time contract check (PLAN §8/§13) — the hand-written initiative
   types must stay assignable to the generated OpenAPI schema, or `tsc` fails. */

import type { components } from '@shared/api-types'

import type { Initiative, InitiativeList } from './api'

type Schemas = components['schemas']
type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

export type _InitiativeMatches = Assert<Extends<Initiative, Schemas['InitiativeRead']>>
export type _InitiativeListMatches = Assert<Extends<InitiativeList, Schemas['InitiativeList']>>
