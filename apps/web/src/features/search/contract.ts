/* Compile-time contract check (PLAN §8/§13) — the hand-written search result type
   must stay assignable to the generated OpenAPI schema, or `tsc` fails. */

import type { components } from '@shared/api-types'

import type { SearchResultItem } from './api'

type Schemas = components['schemas']
type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

export type _SearchItemMatches = Assert<Extends<SearchResultItem, Schemas['SearchResultItem']>>
