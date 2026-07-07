import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type ProjectType = {
  id: string
  project_id: string
  key: string
  name: string
  position: number
  is_active: boolean
}

export type ProjectTypeList = { items: ProjectType[]; total: number }

export function useProjectTypes(projectId: string) {
  return useQuery({
    queryKey: ['project-types', projectId],
    queryFn: () => api<ProjectTypeList>(`/api/v1/projects/${projectId}/types`),
  })
}

export function useUpdateProjectType(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ typeId, ...input }: { typeId: string; name?: string; is_active?: boolean }) =>
      api<ProjectType>(`/api/v1/projects/${projectId}/types/${typeId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-types', projectId] })
    },
  })
}

export function useReorderProjectTypes(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      api<ProjectTypeList>(`/api/v1/projects/${projectId}/types/order`, {
        method: 'PUT',
        body: JSON.stringify({ ordered_ids: orderedIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-types', projectId] })
    },
  })
}
