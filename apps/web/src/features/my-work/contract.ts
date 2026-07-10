/* Compile-time contract check (PLAN §8/§13) — the hand-written my-work types
   must stay assignable to the generated OpenAPI schema, or `tsc` fails. */

import type { components } from '@shared/api-types'

import type { MeWork, MyActivity, MyWorkPackage } from './api'

type Schemas = components['schemas']
type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

export type _MyWorkPackageMatches = Assert<Extends<MyWorkPackage, Schemas['MyWorkPackage']>>
export type _MyActivityMatches = Assert<Extends<MyActivity, Schemas['MyActivityRead']>>
export type _MeWorkMatches = Assert<Extends<MeWork, Schemas['MeWorkRead']>>
