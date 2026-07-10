import type { components } from '@shared/api-types'

import type { PersonalNote, PersonalNoteList } from './api'

type Schemas = components['schemas']
type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

export type _PersonalNoteMatches = Assert<Extends<PersonalNote, Schemas['PersonalNoteRead']>>
export type _PersonalNoteListMatches = Assert<Extends<PersonalNoteList, Schemas['PersonalNoteList']>>
