import { useMutation, useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type AiCapabilities = { ai_summary_enabled: boolean }

export type AiSummaryResponse = {
  work_package_id: string
  summary: string
  provider: string
}

export function useCapabilities() {
  return useQuery({
    queryKey: ['capabilities'],
    queryFn: () => api<AiCapabilities>('/api/v1/capabilities'),
    staleTime: Infinity, // flags change only at deploy time
  })
}

export function useSummarize(wpId: string) {
  return useMutation({
    mutationFn: () =>
      api<AiSummaryResponse>(`/api/v1/work-packages/${wpId}/summary`, { method: 'POST' }),
  })
}
