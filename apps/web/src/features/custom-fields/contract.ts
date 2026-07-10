/* Compile-time contract check (PLAN §8/§13) — the hand-written custom-field
   types must stay assignable to the generated OpenAPI schema, or `tsc` fails. */

import type { components } from '@shared/api-types'

import type { CustomField, CustomValueList } from './api'

type Schemas = components['schemas']
type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

export type _CustomFieldMatches = Assert<Extends<CustomField, Schemas['CustomFieldRead']>>
export type _CustomValueListMatches = Assert<Extends<CustomValueList, Schemas['CustomValueList']>>
