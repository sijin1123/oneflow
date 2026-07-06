import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type ModuleState = 'planned' | 'in_progress' | 'paused' | 'completed' | 'cancelled'

export type ProjectModule = {
  id: string
  project_id: string
  name: string
  description: string | null
  lead_id: string | null
  state: ModuleState
  start_date: string | null
  target_date: string | null
  work_package_count: number
  done_work_package_count: number
  created_at: string
  updated_at: string
}

export type ModuleList = { items: ProjectModule[]; total: number }

export const MODULE_STATE_LABELS: Record<ModuleState, string> = {
  planned: '계획됨',
  in_progress: '진행 중',
  paused: '일시 중지',
  completed: '완료',
  cancelled: '취소됨',
}

export function useModules(projectId: string) {
  return useQuery({
    queryKey: ['modules', projectId],
    queryFn: () => api<ModuleList>(`/api/v1/projects/${projectId}/modules`),
  })
}

export function useCreateModule(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; lead_id?: string | null }) =>
      api<ProjectModule>(`/api/v1/projects/${projectId}/modules`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['modules', projectId] })
    },
  })
}

export function useUpdateModule(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      moduleId,
      ...input
    }: {
      moduleId: string
      name?: string
      state?: ModuleState
      lead_id?: string | null
    }) =>
      api<ProjectModule>(`/api/v1/projects/${projectId}/modules/${moduleId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['modules', projectId] })
    },
  })
}

export function useDeleteModule(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (moduleId: string) =>
      api<void>(`/api/v1/projects/${projectId}/modules/${moduleId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['modules', projectId] })
    },
  })
}
