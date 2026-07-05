import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type ProjectStatus = {
  id: string
  project_id: string
  key: string
  name: string
  position: number
}

export type ProjectStatusList = { items: ProjectStatus[]; total: number }

export function useProjectStatuses(projectId: string) {
  return useQuery({
    queryKey: ['project-statuses', projectId],
    queryFn: () => api<ProjectStatusList>(`/api/v1/projects/${projectId}/statuses`),
  })
}

export function useUpdateProjectStatus(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; name?: string; position?: number }) =>
      api<ProjectStatus>(`/api/v1/projects/${projectId}/statuses/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: input.name, position: input.position }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-statuses', projectId] })
    },
  })
}

/** Atomic reorder: send the full ordered id list in one request so a failed swap
 *  can never leave two statuses sharing a position (fable5 audit). */
export function useReorderProjectStatuses(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      api<ProjectStatusList>(`/api/v1/projects/${projectId}/statuses/order`, {
        method: 'PUT',
        body: JSON.stringify({ ordered_ids: orderedIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-statuses', projectId] })
    },
  })
}
