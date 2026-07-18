import type { Initiative, InitiativeState } from './api.ts'

export type InitiativeStateFilter = 'all' | InitiativeState
export type InitiativeHealthFilter = 'all' | 'on_track' | 'at_risk' | 'off_track' | 'unreported'
export type InitiativeOwnershipFilter = 'all' | 'mine' | 'shared' | 'unowned'
export type InitiativeSort = 'updated_desc' | 'target_asc' | 'name_asc'

export type InitiativeDiscovery = {
  query: string
  state: InitiativeStateFilter
  health: InitiativeHealthFilter
  ownership: InitiativeOwnershipFilter
  sort: InitiativeSort
}

export const DEFAULT_INITIATIVE_DISCOVERY: InitiativeDiscovery = {
  query: '',
  state: 'all',
  health: 'all',
  ownership: 'all',
  sort: 'updated_desc',
}

const STATES = new Set<InitiativeStateFilter>([
  'all',
  'planned',
  'in_progress',
  'paused',
  'completed',
  'cancelled',
])
const HEALTH = new Set<InitiativeHealthFilter>([
  'all',
  'on_track',
  'at_risk',
  'off_track',
  'unreported',
])
const OWNERSHIP = new Set<InitiativeOwnershipFilter>(['all', 'mine', 'shared', 'unowned'])
const SORTS = new Set<InitiativeSort>(['updated_desc', 'target_asc', 'name_asc'])
const nameCollator = new Intl.Collator('ko', { sensitivity: 'base', numeric: true })

function readClosedValue<T extends string>(value: string | null, values: Set<T>, fallback: T): T {
  return value !== null && values.has(value as T) ? (value as T) : fallback
}

export function readInitiativeDiscovery(params: URLSearchParams): InitiativeDiscovery {
  return {
    query: (params.get('q') ?? '').trimStart().slice(0, 120),
    state: readClosedValue(params.get('state'), STATES, 'all'),
    health: readClosedValue(params.get('health'), HEALTH, 'all'),
    ownership: readClosedValue(params.get('owner'), OWNERSHIP, 'all'),
    sort: readClosedValue(params.get('sort'), SORTS, 'updated_desc'),
  }
}

function matchesQuery(initiative: Initiative, query: string) {
  const normalized = query.trim().toLocaleLowerCase('ko')
  if (!normalized) return true
  return [
    initiative.name,
    initiative.description,
    initiative.owner_name,
    ...initiative.labels.map((label) => label.name),
    ...initiative.projects.map((project) => project.project_name),
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase('ko').includes(normalized))
}

function matchesOwnership(initiative: Initiative, ownership: InitiativeOwnershipFilter) {
  if (ownership === 'mine') return initiative.is_mine
  if (ownership === 'shared') return !initiative.is_mine && initiative.owner_id !== null
  if (ownership === 'unowned') return initiative.owner_id === null
  return true
}

function compareName(left: Initiative, right: Initiative) {
  return nameCollator.compare(left.name, right.name) || left.id.localeCompare(right.id)
}

function compareInitiatives(left: Initiative, right: Initiative, sort: InitiativeSort) {
  if (sort === 'name_asc') return compareName(left, right)
  if (sort === 'target_asc') {
    if (left.target_date === null && right.target_date !== null) return 1
    if (left.target_date !== null && right.target_date === null) return -1
    const targetOrder = (left.target_date ?? '').localeCompare(right.target_date ?? '')
    return targetOrder || compareName(left, right)
  }
  return right.updated_at.localeCompare(left.updated_at) || compareName(left, right)
}

export function discoverInitiatives(items: Initiative[], discovery: InitiativeDiscovery) {
  return items
    .filter((initiative) => matchesQuery(initiative, discovery.query))
    .filter((initiative) => discovery.state === 'all' || initiative.state === discovery.state)
    .filter((initiative) => {
      if (discovery.health === 'all') return true
      if (discovery.health === 'unreported') return initiative.health === null
      return initiative.health === discovery.health
    })
    .filter((initiative) => matchesOwnership(initiative, discovery.ownership))
    .toSorted((left, right) => compareInitiatives(left, right, discovery.sort))
}

export function countActiveInitiativeDiscovery(discovery: InitiativeDiscovery, labelId: string) {
  return [
    discovery.query.trim().length > 0,
    discovery.state !== 'all',
    discovery.health !== 'all',
    discovery.ownership !== 'all',
    discovery.sort !== 'updated_desc',
    labelId.length > 0,
  ].filter(Boolean).length
}
