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

export function useWorkspaceWorkItems(q: string) {
  const query = q.trim()
  return useQuery({
    queryKey: ['workspace-work-items', query],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '200' })
      if (query) params.set('q', query)
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
