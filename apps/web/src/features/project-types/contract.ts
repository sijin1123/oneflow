/* Compile-time contract check (PLAN §8/§13). */

import type { components } from '@shared/api-types'

import type { ProjectType, ProjectTypeList } from './api'

type Schemas = components['schemas']
type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

export type _ProjectTypeMatches = Assert<Extends<ProjectType, Schemas['ProjectTypeRead']>>
export type _ProjectTypeListMatches = Assert<Extends<ProjectTypeList, Schemas['ProjectTypeList']>>
