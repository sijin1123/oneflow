/* Compile-time contract check (PLAN §8/§13) — the hand-written AutomationRule type
   must stay assignable to the generated OpenAPI schema, or `tsc` fails. */

import type { components } from '@shared/api-types'

import type { AutomationRule } from './api'

type Schemas = components['schemas']
type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

export type _AutomationRuleMatches = Assert<Extends<AutomationRule, Schemas['AutomationRuleRead']>>
