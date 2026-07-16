import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type CycleStatus = 'upcoming' | 'active' | 'completed'

export type Cycle = {
  id: string
  project_id: string
  name: string
  description: string | null
  start_date: string
  end_date: string
  status: CycleStatus
  work_package_count: number
  done_work_package_count: number
  created_at: string
  updated_at: string
}

export type CycleList = { items: Cycle[]; total: number }

export function useCycles(projectId: string) {
  return useQuery({
    queryKey: ['cycles', projectId],
    queryFn: () => api<CycleList>(`/api/v1/projects/${projectId}/cycles`),
  })
}

export function useCreateCycle(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; start_date: string; end_date: string }) =>
      api<Cycle>(`/api/v1/projects/${projectId}/cycles`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cycles', projectId] })
    },
  })
}

export function useUpdateCycle(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      cycleId,
      ...input
    }: {
      cycleId: string
      name?: string
      start_date?: string
      end_date?: string
    }) =>
      api<Cycle>(`/api/v1/projects/${projectId}/cycles/${cycleId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cycles', projectId] })
    },
  })
}

export function useDeleteCycle(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (cycleId: string) =>
      api<void>(`/api/v1/projects/${projectId}/cycles/${cycleId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cycles', projectId] })
    },
  })
}

export function useRolloverCycle(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ cycleId, targetCycleId }: { cycleId: string; targetCycleId: string }) =>
      api<{ moved: number }>(`/api/v1/projects/${projectId}/cycles/${cycleId}/rollover`, {
        method: 'POST',
        body: JSON.stringify({ target_cycle_id: targetCycleId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cycles', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['work-packages', projectId] })
    },
  })
}

export type BurndownDay = {
  date: string
  scope: number
  remaining: number
  delivered: number
}

export type Burndown = {
  scope: 'tracked_assignment' | 'legacy_current_assignment'
  tracking_started_at: string
  coverage_start: string | null
  coverage_complete: boolean
  total_scope: number
  current_scope: number
  added_count: number
  removed_count: number
  delivered: number
  days: BurndownDay[]
}

export function useCycleBurndown(projectId: string, cycleId: string | null) {
  return useQuery({
    queryKey: ['cycle-burndown', projectId, cycleId],
    queryFn: () =>
      api<Burndown>(`/api/v1/projects/${projectId}/cycles/${cycleId}/burndown`),
    enabled: cycleId !== null,
  })
}
