import type {
  SearchDocumentItem,
  SearchInitiativeItem,
  SearchMeetingItem,
  SearchNamedItem,
  SearchResultItem,
  UnifiedSearchResults,
} from './api'

export type CommandPaletteKind =
  | 'work_packages'
  | 'documents'
  | 'meetings'
  | 'cycles'
  | 'modules'
  | 'initiatives'

export type CommandPaletteTab = 'all' | CommandPaletteKind

export type CommandPaletteItem = {
  key: string
  kind: CommandPaletteKind
  label: string
  detail: string
  href: string
  projectKey?: string
  snippet?: string | null
  matchedIn?: 'primary' | 'content'
}

export const COMMAND_PALETTE_TABS: Array<{ key: CommandPaletteTab; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'work_packages', label: '작업' },
  { key: 'documents', label: '문서' },
  { key: 'meetings', label: '회의' },
  { key: 'cycles', label: '사이클' },
  { key: 'modules', label: '모듈' },
  { key: 'initiatives', label: '이니셔티브' },
]

export const COMMAND_PALETTE_KIND_LABELS: Record<CommandPaletteKind, string> = {
  work_packages: '작업',
  documents: '문서',
  meetings: '회의',
  cycles: '사이클',
  modules: '모듈',
  initiatives: '이니셔티브',
}

export function commandPaletteSearchKey(query: string): readonly ['command-palette-search', string] {
  return ['command-palette-search', query.trim()]
}

export function advancedSearchHref(query: string): string {
  const trimmed = query.trim()
  return trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : '/search'
}

export function filterCommandPaletteItems(
  items: CommandPaletteItem[],
  tab: CommandPaletteTab,
): CommandPaletteItem[] {
  if (tab === 'all') return items
  return items.filter((item) => item.kind === tab)
}

export function countCommandPaletteItems(
  items: CommandPaletteItem[],
): Record<CommandPaletteTab, number> {
  const counts: Record<CommandPaletteTab, number> = {
    all: items.length,
    work_packages: 0,
    documents: 0,
    meetings: 0,
    cycles: 0,
    modules: 0,
    initiatives: 0,
  }
  for (const item of items) counts[item.kind] += 1
  return counts
}

export function flattenCommandPaletteResults(
  data: UnifiedSearchResults | null | undefined,
  includeDocuments = true,
  includeInitiatives = true,
) {
  const items: CommandPaletteItem[] = []
  const seen = new Set<string>()
  const push = (item: CommandPaletteItem) => {
    if (seen.has(item.key)) return
    seen.add(item.key)
    items.push(item)
  }

  for (const item of data?.work_packages.items ?? []) {
    push(fromWorkPackage(item))
  }
  if (includeDocuments) {
    for (const item of data?.documents.items ?? []) {
      push(fromDocument(item))
    }
  }
  for (const item of data?.meetings.items ?? []) {
    push(fromMeeting(item))
  }
  for (const item of data?.cycles.items ?? []) {
    push(fromNamed(item, 'cycles'))
  }
  for (const item of data?.modules.items ?? []) {
    push(fromNamed(item, 'modules'))
  }
  if (includeInitiatives) {
    for (const item of data?.initiatives.items ?? []) {
      push(fromInitiative(item))
    }
  }

  return items
}

function fromWorkPackage(item: SearchResultItem): CommandPaletteItem {
  return {
    key: `work_packages:${item.id}`,
    kind: 'work_packages',
    label: item.subject,
    detail: item.project_name,
    href: `/projects/${item.project_id}/work-packages/${item.id}`,
    projectKey: item.project_key,
    snippet: item.snippet,
    matchedIn: item.matched_in,
  }
}

function fromDocument(item: SearchDocumentItem): CommandPaletteItem {
  return {
    key: `documents:${item.id}`,
    kind: 'documents',
    label: item.title,
    detail: item.project_name,
    href: `/projects/${item.project_id}/documents/${item.id}`,
    projectKey: item.project_key,
    snippet: item.snippet,
    matchedIn: item.matched_in,
  }
}

function fromMeeting(item: SearchMeetingItem): CommandPaletteItem {
  return {
    key: `meetings:${item.id}`,
    kind: 'meetings',
    label: item.title,
    detail: item.scheduled_on ? `${item.project_name} · ${item.scheduled_on}` : item.project_name,
    href: `/projects/${item.project_id}/meetings/${item.id}`,
    projectKey: item.project_key,
    snippet: item.snippet,
    matchedIn: item.matched_in,
  }
}

function fromNamed(item: SearchNamedItem, kind: 'cycles' | 'modules'): CommandPaletteItem {
  return {
    key: `${kind}:${item.id}`,
    kind,
    label: item.name,
    detail: item.project_name,
    href: `/projects/${item.project_id}/${kind}`,
    projectKey: item.project_key,
  }
}

function fromInitiative(item: SearchInitiativeItem): CommandPaletteItem {
  return {
    key: `initiatives:${item.id}`,
    kind: 'initiatives',
    label: item.name,
    detail: item.state,
    href: `/initiatives?highlight=${encodeURIComponent(item.id)}`,
  }
}
