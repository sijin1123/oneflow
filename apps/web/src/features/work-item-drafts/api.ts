import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

import type { WorkPackage, WpPriority, WpStatus, WpType } from '@/features/work-packages/types'

export type WorkItemDraftContent = {
  subject: string
  type: WpType
  status: WpStatus
  priority: WpPriority
  assignee_id: string | null
  due_date: string | null
}

export type WorkItemDraft = {
  id: string
  project_id: string
  content: WorkItemDraftContent
  version: number
  created_at: string
  updated_at: string
}

export type WorkItemDraftList = {
  items: WorkItemDraft[]
  total: number
  limit: number
  offset: number
}

const listKey = ['work-item-drafts'] as const

export function useWorkItemDrafts(limit = 50, offset = 0) {
  return useQuery({
    queryKey: [...listKey, limit, offset],
    queryFn: () =>
      api<WorkItemDraftList>(`/api/v1/me/work-item-drafts?limit=${limit}&offset=${offset}`),
  })
}

export function useWorkItemDraft(draftId: string | null) {
  return useQuery({
    queryKey: ['work-item-draft', draftId],
    queryFn: () => api<WorkItemDraft>(`/api/v1/work-item-drafts/${draftId}`),
    enabled: draftId !== null,
    retry: false,
  })
}

export function useCreateWorkItemDraft(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (content: WorkItemDraftContent) =>
      api<WorkItemDraft>(`/api/v1/projects/${projectId}/work-item-drafts`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),
    onSuccess: (draft) => {
      queryClient.setQueryData(['work-item-draft', draft.id], draft)
      void queryClient.invalidateQueries({ queryKey: listKey })
    },
  })
}

export function useSaveWorkItemDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ draft, content }: { draft: WorkItemDraft; content: WorkItemDraftContent }) =>
      api<WorkItemDraft>(`/api/v1/work-item-drafts/${draft.id}`, {
        method: 'PUT',
        body: JSON.stringify({ expected_version: draft.version, content }),
      }),
    onSuccess: (draft) => {
      queryClient.setQueryData(['work-item-draft', draft.id], draft)
      void queryClient.invalidateQueries({ queryKey: listKey })
    },
    onError: (_error, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['work-item-draft', variables.draft.id] })
      void queryClient.invalidateQueries({ queryKey: listKey })
    },
  })
}

export function useSubmitWorkItemDraft(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      draft,
      content,
    }: {
      draft: WorkItemDraft
      content: WorkItemDraftContent
    }) => {
      const saved = await api<WorkItemDraft>(`/api/v1/work-item-drafts/${draft.id}`, {
        method: 'PUT',
        body: JSON.stringify({ expected_version: draft.version, content }),
      })
      return api<WorkPackage>(`/api/v1/work-item-drafts/${draft.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ expected_version: saved.version }),
      })
    },
    onSuccess: (_workPackage, variables) => {
      queryClient.removeQueries({ queryKey: ['work-item-draft', variables.draft.id] })
      void queryClient.invalidateQueries({ queryKey: listKey })
      void queryClient.invalidateQueries({ queryKey: ['work-packages', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['project-activities', projectId] })
    },
    onError: (_error, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['work-item-draft', variables.draft.id] })
      void queryClient.invalidateQueries({ queryKey: listKey })
    },
  })
}

export function useDeleteWorkItemDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion: number }) =>
      api<void>(`/api/v1/work-item-drafts/${id}?expected_version=${expectedVersion}`, {
        method: 'DELETE',
      }),
    onSuccess: (_result, variables) => {
      queryClient.removeQueries({ queryKey: ['work-item-draft', variables.id] })
      void queryClient.invalidateQueries({ queryKey: listKey })
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: listKey }),
  })
}
