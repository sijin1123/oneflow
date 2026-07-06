import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

import type { Project, ProjectList } from './types'

export function useProjects(includeArchived = false) {
  return useQuery({
    queryKey: ['projects', { includeArchived }],
    queryFn: () =>
      api<ProjectList>(`/api/v1/projects${includeArchived ? '?include_archived=true' : ''}`),
  })
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<Project>(`/api/v1/projects/${projectId}`),
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { key: string; name: string; description?: string | null }) =>
      api<Project>('/api/v1/projects', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: { name?: string; description?: string | null; budget?: number | null }) =>
      api<Project>(`/api/v1/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useArchiveProject(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (archive: boolean) =>
      api<Project>(`/api/v1/projects/${projectId}/${archive ? 'archive' : 'unarchive'}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
}
