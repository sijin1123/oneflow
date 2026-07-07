import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type InitiativeState = 'planned' | 'in_progress' | 'paused' | 'completed' | 'cancelled'

export type InitiativeProject = {
  project_id: string
  project_name: string
  work_package_count: number
  done_work_package_count: number
}

export type Initiative = {
  id: string
  name: string
  description: string | null
  owner_id: string | null
  owner_name: string | null
  state: InitiativeState
  start_date: string | null
  target_date: string | null
  health: 'on_track' | 'at_risk' | 'off_track' | null
  health_note: string | null
  health_updated_by: string | null
  health_updated_at: string | null
  is_mine: boolean
  connected_project_count: number
  projects: InitiativeProject[]
  created_at: string
  updated_at: string
}

export type InitiativeList = { items: Initiative[]; total: number }

export const INITIATIVE_STATE_LABELS: Record<InitiativeState, string> = {
  planned: '계획됨',
  in_progress: '진행 중',
  paused: '일시 중지',
  completed: '완료',
  cancelled: '취소됨',
}

export function useInitiatives() {
  return useQuery({
    queryKey: ['initiatives'],
    queryFn: () => api<InitiativeList>('/api/v1/initiatives'),
  })
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['initiatives'] })
}

export function useCreateInitiative() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string }) =>
      api<Initiative>('/api/v1/initiatives', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useUpdateInitiative() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string
      name?: string
      state?: InitiativeState
      health?: string | null
      health_note?: string | null
    }) =>
      api<Initiative>(`/api/v1/initiatives/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useDeleteInitiative() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/v1/initiatives/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useConnectProject(initiativeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) =>
      api<Initiative>(`/api/v1/initiatives/${initiativeId}/projects`, {
        method: 'POST',
        body: JSON.stringify({ project_id: projectId }),
      }),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useDisconnectProject(initiativeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) =>
      api<Initiative>(`/api/v1/initiatives/${initiativeId}/projects/${projectId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => invalidate(queryClient),
  })
}
