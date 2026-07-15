import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type AuthAssistanceKind = 'sign_in_help' | 'workspace_access'
export type AuthAssistanceStatus = 'pending' | 'in_review' | 'resolved' | 'rejected'

export type AuthAssistanceRequest = {
  id: string
  kind: AuthAssistanceKind
  status: AuthAssistanceStatus
  email: string | null
  reason: string | null
  submission_count: number
  last_submitted_at: string
  version: number
  triage_note: string | null
  triaged_by_id: string | null
  triaged_at: string | null
  redacted_at: string | null
  created_at: string
  updated_at: string
}

export type AuthAssistanceList = {
  items: AuthAssistanceRequest[]
  total: number
  limit: number
  offset: number
}

export type AuthAssistanceFilters = {
  status: AuthAssistanceStatus | ''
  kind: AuthAssistanceKind | ''
  offset: number
}

export function authAssistanceParams(filters: AuthAssistanceFilters) {
  const params = new URLSearchParams({ limit: '50', offset: String(filters.offset) })
  if (filters.status) params.set('status', filters.status)
  if (filters.kind) params.set('kind', filters.kind)
  return params
}

const queryKey = ['admin-auth-assistance'] as const

export function useAdminAuthAssistance(filters: AuthAssistanceFilters, enabled = true) {
  return useQuery({
    queryKey: [...queryKey, filters],
    queryFn: () =>
      api<AuthAssistanceList>(`/api/v1/admin/auth-assistance-requests?${authAssistanceParams(filters)}`),
    enabled,
    staleTime: 0,
    gcTime: 0,
  })
}

export function useTriageAuthAssistance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      status,
      expectedVersion,
      note,
    }: {
      id: string
      status: Exclude<AuthAssistanceStatus, 'pending'>
      expectedVersion: number
      note?: string
    }) =>
      api<AuthAssistanceRequest>(`/api/v1/admin/auth-assistance-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          expected_version: expectedVersion,
          note,
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
}

export function useRedactAuthAssistance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/v1/admin/auth-assistance-requests/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
}
