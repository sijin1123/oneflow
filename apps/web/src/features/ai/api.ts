import { useMutation, useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type AiCapabilities = { ai_summary_enabled: boolean }

export type AiSummaryResponse = {
  work_package_id: string
  summary: string
  provider: string
}

export const aiCapabilitiesKey = ['capabilities'] as const

export function useCapabilities() {
  return useQuery({
    queryKey: aiCapabilitiesKey,
    queryFn: () => api<AiCapabilities>('/api/v1/capabilities'),
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
}

export function useSummarize(wpId: string) {
  return useMutation({
    mutationFn: (question?: string) =>
      api<AiSummaryResponse>(`/api/v1/work-packages/${wpId}/summary`, {
        method: 'POST',
        body: question ? JSON.stringify({ question }) : undefined,
      }),
  })
}
