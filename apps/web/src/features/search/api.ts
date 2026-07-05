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
  due_date: string | null
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
