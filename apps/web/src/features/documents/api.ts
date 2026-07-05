import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, api } from '@/lib/api'

export type DocumentListItem = {
  id: string
  project_id: string
  title: string
  author_id: string | null
  version: number
  created_at: string
  updated_at: string
}

export type ProjectDocument = DocumentListItem & { body: string | null }

export type DocumentList = { items: DocumentListItem[]; total: number }

export function useDocuments(projectId: string) {
  return useQuery({
    queryKey: ['documents', projectId],
    queryFn: () => api<DocumentList>(`/api/v1/projects/${projectId}/documents`),
  })
}

export function useDocument(docId: string | null) {
  return useQuery({
    queryKey: ['document', docId],
    queryFn: () => api<ProjectDocument>(`/api/v1/documents/${docId}`),
    enabled: docId !== null,
  })
}

export function useCreateDocument(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { title: string; body?: string | null }) =>
      api<ProjectDocument>(`/api/v1/projects/${projectId}/documents`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', projectId] })
    },
  })
}

export type DocumentConflict = { detail: string; current: ProjectDocument }

export function useUpdateDocument(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      docId: string
      expected_version: number
      title?: string
      body?: string | null
    }) => {
      const { docId, ...patch } = input
      return api<ProjectDocument>(`/api/v1/documents/${docId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
    },
    onSuccess: (doc) => {
      queryClient.setQueryData(['document', doc.id], doc)
      void queryClient.invalidateQueries({ queryKey: ['documents', projectId] })
    },
    // On a 409 we deliberately do NOT overwrite the cached document: that would
    // trip the editor's resync effect and destroy the user's unsaved draft. The
    // page reads the conflict's current version from update.error and lets the
    // user retry the save (overwriting the server) without losing their edits.
  })
}

export function conflictOf(error: unknown): DocumentConflict | null {
  if (error instanceof ApiError && error.status === 409) {
    return (error.payload as DocumentConflict | null) ?? null
  }
  return null
}

export function useDeleteDocument(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (docId: string) =>
      api<void>(`/api/v1/documents/${docId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', projectId] })
    },
  })
}
