/* Compile-time contract checks (PLAN §8/§13).

   The hand-written types the UI renders must stay structurally compatible with
   the generated OpenAPI schema types (@shared/api-types). If the server contract
   changes (a field is added/renamed/retyped), these assertions fail `tsc` — the
   drift is caught at typecheck, not at runtime. The CI drift job additionally
   fails if the generated file itself is stale versus the live schema.

   Direction: our types must be assignable TO the generated schema (server is the
   source of truth for shape; the UI may narrow value unions like status). */

import type { components } from '@shared/api-types'

import type { Project } from '../projects/types'
import type {
  Activity,
  Comment,
  ConflictBody,
  CsvImportResult,
  CsvRowError,
  Relation,
  WorkPackage,
} from './types'

type Schemas = components['schemas']

// Assert<T> only accepts `true`; a `false` (drift) is a compile error.
type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

export type _WorkPackageMatches = Assert<Extends<WorkPackage, Schemas['WorkPackageRead']>>
export type _ProjectMatches = Assert<Extends<Project, Schemas['ProjectRead']>>
export type _CommentMatches = Assert<Extends<Comment, Schemas['CommentRead']>>
export type _ActivityMatches = Assert<Extends<Activity, Schemas['ActivityRead']>>
export type _RelationMatches = Assert<Extends<Relation, Schemas['RelationRead']>>
export type _ConflictMatches = Assert<Extends<ConflictBody, Schemas['ConflictResponse']>>
export type _CsvImportMatches = Assert<Extends<CsvImportResult, Schemas['CsvImportResult']>>
export type _CsvRowErrorMatches = Assert<Extends<CsvRowError, Schemas['CsvRowError']>>
