import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { registerIdentityReset } from '@/features/auth/cache'

import type {
  Project,
  ProjectHealthHistoryList,
  ProjectList,
  ProjectPhase,
  ProjectPhaseKey,
  ProjectPhaseList,
} from './types'
import {
  LatestPreferenceWriter,
  toProjectDirectoryPreferencesPayload,
  type ProjectDirectoryPreferences,
  type ProjectDirectoryPreferencesPayload,
} from './projectDirectoryPreferences'

export type ProjectDirectoryPreferencesResponse = {
  columns: string[]
  sort_key: string
  sort_direction: string
  layout: string
  updated_at: string | null
  is_default: boolean
}

export type ProjectDirectoryPreferencesInput = ProjectDirectoryPreferencesPayload

export function getProjectDirectoryPreferences() {
  return api<ProjectDirectoryPreferencesResponse>('/api/v1/me/project-directory-preferences')
}

export function putProjectDirectoryPreferences(input: ProjectDirectoryPreferencesInput) {
  return api<ProjectDirectoryPreferencesResponse>('/api/v1/me/project-directory-preferences', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export const projectDirectoryPreferenceWriter = new LatestPreferenceWriter<
  ProjectDirectoryPreferences,
  ProjectDirectoryPreferencesResponse
>((preferences) =>
  putProjectDirectoryPreferences(toProjectDirectoryPreferencesPayload(preferences)),
)

registerIdentityReset(() => projectDirectoryPreferenceWriter.reset())

export function getProject(projectId: string) {
  return api<Project>(`/api/v1/projects/${projectId}`)
}

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
    queryFn: () => getProject(projectId),
  })
}

export function getProjectHealthHistory(projectId: string, limit = 20, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  return api<ProjectHealthHistoryList>(
    `/api/v1/projects/${projectId}/health-history?${params.toString()}`,
  )
}

export function useProjectHealthHistory(projectId: string) {
  return useQuery({
    queryKey: ['project-health-history', projectId],
    queryFn: () => getProjectHealthHistory(projectId),
  })
}

export function useProjectPhases(projectId: string) {
  return useQuery({
    queryKey: ['project-phases', projectId],
    queryFn: () => api<ProjectPhaseList>(`/api/v1/projects/${projectId}/phases`),
    enabled: Boolean(projectId),
  })
}

export function useUpdateProjectPhase(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      phaseKey,
      ...input
    }: {
      phaseKey: ProjectPhaseKey
      active?: boolean
      start_gate_active?: boolean
      finish_gate_active?: boolean
      start_date?: string | null
      end_date?: string | null
      version: number
    }) =>
      api<ProjectPhase>(`/api/v1/projects/${projectId}/phases/${phaseKey}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (phase) => {
      queryClient.setQueryData<ProjectPhaseList>(['project-phases', projectId], (current) => {
        if (!current) return current
        return {
          ...current,
          items: current.items.map((item) => (item.key === phase.key ? phase : item)),
        }
      })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-phases', projectId] })
    },
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      key: string
      name: string
      description?: string | null
      template_project_id?: string | null
    }) => api<Project>('/api/v1/projects', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: {
      name?: string
      description?: string | null
      cover_attachment_id?: string | null
      budget?: number | null
      health?: string | null
      health_note?: string | null
    }) =>
      api<Project>(`/api/v1/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['project-health-history', projectId] })
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
