/* Compile-time contract checks (PLAN §8/§13) — hand-written AI types must stay
   assignable to the generated OpenAPI schema, or `tsc` fails. */

import type { components } from '@shared/api-types'

import type { AiCapabilities, AiSummaryResponse } from './api'

type Schemas = components['schemas']
type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

export type _AiCapabilitiesMatches = Assert<Extends<AiCapabilities, Schemas['AiCapabilities']>>
export type _AiSummaryMatches = Assert<Extends<AiSummaryResponse, Schemas['AiSummaryResponse']>>
