import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api } from '@/lib/api'
import { registerIdentityReset } from '@/features/auth/cache'

import type {
  Project,
  ProjectHealthHistoryList,
  ProjectList,
  ProjectPublication,
  ProjectPhase,
  ProjectPhaseKey,
  ProjectPhaseList,
  PublicProject,
} from './types'
import {
  LatestPreferenceWriter,
  toProjectDirectoryPreferencesPayload,
  type ProjectDirectoryPreferences,
  type ProjectDirectoryPreferencesPayload,
} from './projectDirectoryPreferences'
import type { ProjectSortKey, SortDir } from './sort'

const PROJECT_DIRECTORY_PAGE_SIZE = 200

async function getAllProjects(includeArchived: boolean) {
  const initialPath = `/api/v1/projects${includeArchived ? '?include_archived=true' : ''}`
  const first = await api<ProjectList>(initialPath)
  if (first.items.length >= first.total) return first

  const items = [...first.items]
  while (items.length < first.total) {
    const params = new URLSearchParams({ limit: '500', offset: String(items.length) })
    if (includeArchived) params.set('include_archived', 'true')
    const page = await api<ProjectList>(`/api/v1/projects?${params.toString()}`)
    if (page.items.length === 0) break
    items.push(...page.items)
  }
  return { ...first, items }
}

type ProjectDirectoryQuery = {
  includeArchived: boolean
  q: string
  sortKey: ProjectSortKey
  sortDirection: SortDir
}

function projectDirectoryPath(query: ProjectDirectoryQuery, offset: number) {
  const params = new URLSearchParams()
  if (offset > 0) {
    params.set('limit', String(PROJECT_DIRECTORY_PAGE_SIZE))
    params.set('offset', String(offset))
  }
  if (query.includeArchived) params.set('include_archived', 'true')
  if (query.q) params.set('q', query.q)
  if (query.sortKey !== 'default') {
    params.set('sort_key', query.sortKey)
    params.set('sort_direction', query.sortDirection)
  }
  const search = params.toString()
  return `/api/v1/projects${search ? `?${search}` : ''}`
}

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
    queryFn: () => getAllProjects(includeArchived),
  })
}

export function useProjectDirectory(query: ProjectDirectoryQuery) {
  return useInfiniteQuery({
    queryKey: ['projects', 'directory', query],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<ProjectList>(projectDirectoryPath(query, pageParam)),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((total, page) => total + page.items.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    placeholderData: keepPreviousData,
    retry: false,
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
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['project-phases', projectId] }),
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

export function useProjectPublication(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['project-publication', projectId],
    queryFn: () => api<ProjectPublication>(`/api/v1/projects/${projectId}/publication`),
    enabled: Boolean(projectId) && enabled,
  })
}

export function usePublishProject(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<ProjectPublication>(`/api/v1/projects/${projectId}/publication`, {
        method: 'POST',
      }),
    onSuccess: (publication) => {
      queryClient.setQueryData(['project-publication', projectId], publication)
    },
  })
}

export function useRevokeProjectPublication(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<ProjectPublication>(`/api/v1/projects/${projectId}/publication`, {
        method: 'DELETE',
      }),
    onSuccess: (publication) => {
      queryClient.setQueryData(['project-publication', projectId], publication)
    },
  })
}

export function usePublicProject(publicId: string) {
  return useQuery({
    queryKey: ['public-project', publicId],
    queryFn: () => api<PublicProject>(`/api/v1/public/projects/${publicId}`),
    enabled: Boolean(publicId),
    retry: false,
  })
}
