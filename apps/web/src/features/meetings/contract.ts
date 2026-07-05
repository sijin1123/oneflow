/* Compile-time contract checks (PLAN §8/§13) — hand meeting types must stay
   assignable to the generated OpenAPI schema, or `tsc` fails. */

import type { components } from '@shared/api-types'

import type { ActionItem, Meeting, MeetingListItem } from './api'

type Schemas = components['schemas']
type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

export type _MeetingMatches = Assert<Extends<Meeting, Schemas['MeetingRead']>>
export type _MeetingListItemMatches = Assert<Extends<MeetingListItem, Schemas['MeetingListItem']>>
export type _ActionItemMatches = Assert<Extends<ActionItem, Schemas['ActionItemRead']>>
