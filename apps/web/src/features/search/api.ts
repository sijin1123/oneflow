import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import type { WpPriority, WpStatus, WpType } from '@/features/work-packages/types'

export type SearchResultItem = {
  id: string
  project_id: string
  project_key: string
  project_name: string
  subject: string
  status: WpStatus
  priority: WpPriority
  type: WpType
  assignee_id?: string | null
  assignee_name?: string | null
  start_date?: string | null
  due_date: string | null
  created_at?: string | null
  updated_at?: string | null
  version: number
  current_user_can_write: boolean
  matched_in: 'primary' | 'content'
  snippet: string | null
}

export type SearchResults = {
  items: SearchResultItem[]
  total: number
  query: string
}

export function useSearch(q: string) {
  const query = q.trim()
  return useQuery({
    queryKey: ['search', query],
    queryFn: () =>
      api<SearchResults>(`/api/v1/search/work-packages?q=${encodeURIComponent(query)}`),
    enabled: query.length > 0,
  })
}

export type WorkspaceWorkItemScope = 'all' | 'assigned' | 'created' | 'subscribed'
export type WorkspaceWorkItemState = 'all' | 'open'
export type WorkspaceWorkItemSort =
  | 'updated'
  | 'due'
  | 'status_asc'
  | 'status_desc'
  | 'priority_asc'
  | 'priority_desc'

export type WorkspacePqlValidation = {
  normalized: string
  fields: string[]
  order_by: string | null
  direction: string | null
  limit: number | null
}

export function validateWorkspacePql(query: string) {
  return api<WorkspacePqlValidation>('/api/v1/search/work-packages/pql/validate', {
    method: 'POST',
    body: JSON.stringify({ query }),
  })
}

export function useWorkspaceWorkItems({
  q,
  scope,
  state,
  sort,
  priority,
  pql,
  limit = 50,
  offset = 0,
}: {
  q: string
  scope: WorkspaceWorkItemScope
  state: WorkspaceWorkItemState
  sort: WorkspaceWorkItemSort
  priority: WpPriority | null
  pql: string | null
  limit?: number
  offset?: number
}) {
  const query = q.trim()
  return useQuery({
    queryKey: ['workspace-work-items', query, scope, state, sort, priority, pql, limit, offset],
    queryFn: () => {
      const params = new URLSearchParams({
        scope,
        state,
        sort,
        limit: String(limit),
        offset: String(offset),
      })
      if (query) params.set('q', query)
      if (priority) params.set('priority', priority)
      if (pql) params.set('pql', pql)
      return api<SearchResults>(`/api/v1/search/work-packages?${params.toString()}`)
    },
  })
}

export type SearchDocumentItem = {
  id: string
  project_id: string
  project_key: string
  project_name: string
  title: string
  matched_in: 'primary' | 'content'
  snippet: string | null
}

export type SearchMeetingItem = SearchDocumentItem & { scheduled_on: string | null }

export type SearchNamedItem = {
  id: string
  project_id: string
  project_key: string
  project_name: string
  name: string
}

export type SearchInitiativeItem = { id: string; name: string; state: string }

type Group<T> = { items: T[]; returned: number; truncated: boolean }

export type UnifiedSearchResults = {
  query: string
  work_packages: Group<SearchResultItem>
  documents: Group<SearchDocumentItem>
  meetings: Group<SearchMeetingItem>
  cycles: Group<SearchNamedItem>
  modules: Group<SearchNamedItem>
  initiatives: Group<SearchInitiativeItem>
}

export function useUnifiedSearch(q: string) {
  const query = q.trim()
  return useQuery({
    queryKey: ['unified-search', query],
    queryFn: () => api<UnifiedSearchResults>(`/api/v1/search?q=${encodeURIComponent(query)}`),
    // The server requires 2+ chars (load control) — don't fire a doomed request.
    enabled: query.length >= 2,
  })
}

export function useCommandPaletteSearch(q: string, enabled: boolean) {
  const query = q.trim()
  return useQuery({
    queryKey: ['command-palette-search', query],
    queryFn: () => api<UnifiedSearchResults>(`/api/v1/search?q=${encodeURIComponent(query)}`),
    enabled: enabled && query.length >= 2,
    staleTime: 0,
    gcTime: 30_000,
  })
}
