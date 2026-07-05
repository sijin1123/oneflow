import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type SavedFilterParams = {
  status?: string | null
  priority?: string | null
  type?: string | null
  q?: string | null
}

export type SavedFilter = {
  id: string
  project_id: string
  name: string
  params: SavedFilterParams
  created_at: string
}

export type SavedFilterList = { items: SavedFilter[]; total: number }

export function useSavedFilters(projectId: string) {
  return useQuery({
    queryKey: ['saved-filters', projectId],
    queryFn: () => api<SavedFilterList>(`/api/v1/projects/${projectId}/saved-filters`),
  })
}

export function useCreateSavedFilter(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; params: SavedFilterParams }) =>
      api<SavedFilter>(`/api/v1/projects/${projectId}/saved-filters`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['saved-filters', projectId] })
    },
  })
}

export function useDeleteSavedFilter(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/v1/projects/${projectId}/saved-filters/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['saved-filters', projectId] })
    },
  })
}
