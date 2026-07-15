import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type ProjectTemplate = {
  id: string
  name: string
  description: string | null
  source_project_id: string | null
  source_project_name: string | null
  created_by: string | null
  creator_name: string | null
  archived_at: string | null
  latest_revision: {
    version: number
    statuses: number
    types: number
    custom_fields: number
    automation_rules: number
  } | null
  updated_at: string
  can_manage: boolean
}
export type ProjectTemplateList = { items: ProjectTemplate[]; total: number; limit: number; offset: number }
export type ProjectCreateResponse = { id: string }
type CreateInput = {
  name: string
  description?: string | null
  source_project_id: string
  publish?: boolean
}
type ApplyInput = { name: string; key: string; description?: string | null }

export function useProjectTemplates(q: string, includeArchived: boolean, offset: number) {
  const params = new URLSearchParams({ include_archived: String(includeArchived), limit: '50', offset: String(offset) })
  if (q) params.set('q', q)
  return useQuery({
    queryKey: ['project-templates', { q, includeArchived, offset }],
    queryFn: () => api<ProjectTemplateList>(`/api/v1/project-templates?${params}`),
  })
}
export function useProjectTemplateSources() {
  return useQuery({
    queryKey: ['project-template-sources'],
    queryFn: () => api<{ items: Array<{ id: string; key: string; name: string }>; total: number }>('/api/v1/project-templates/sources'),
  })
}
function useTemplateMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const client = useQueryClient()
  return useMutation({ mutationFn, onSuccess: () => void client.invalidateQueries({ queryKey: ['project-templates'] }) })
}
export function useCreateProjectTemplate() { return useTemplateMutation<CreateInput, ProjectTemplate>((input) => api('/api/v1/project-templates', { method: 'POST', body: JSON.stringify(input) })) }
export function useRefreshProjectTemplate(id: string) { return useTemplateMutation<{ source_project_id: string }, ProjectTemplate>((input) => api(`/api/v1/project-templates/${id}/revisions`, { method: 'POST', body: JSON.stringify(input) })) }
export function useApplyProjectTemplate(id: string) { return useTemplateMutation<ApplyInput, ProjectCreateResponse>((input) => api(`/api/v1/project-templates/${id}/apply`, { method: 'POST', body: JSON.stringify(input) })) }
export function useArchiveProjectTemplate(id: string, archive: boolean) { return useTemplateMutation<void, ProjectTemplate>(() => api(`/api/v1/project-templates/${id}/${archive ? 'archive' : 'unarchive'}`, { method: 'POST' })) }
export function useDeleteProjectTemplate(id: string) { return useTemplateMutation<void, void>(() => api(`/api/v1/project-templates/${id}`, { method: 'DELETE' })) }
