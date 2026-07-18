import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, api } from '@/lib/api'

export type DocumentListItem = {
  id: string
  project_id: string
  parent_id: string | null
  title: string
  author_id: string | null
  visibility: 'shared' | 'private'
  archived_at: string | null
  archived_by_user_id: string | null
  archived_by_name: string | null
  version: number
  created_at: string
  updated_at: string
}

export type ProjectDocument = DocumentListItem & { body: string | null }

export type DocumentList = { items: DocumentListItem[]; total: number }

export type DocumentActivityKind =
  | 'document_created'
  | 'document_updated'
  | 'document_archived'
  | 'document_restored'

export type DocumentActivity = {
  id: string
  actor_id: string | null
  actor_name: string | null
  kind: DocumentActivityKind
  changed_fields: string[]
  created_at: string
}

export type DocumentActivityList = { items: DocumentActivity[]; total: number }

const DOCUMENT_ACTIVITY_PAGE_SIZE = 10

export function useDocumentActivities(docId: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['document-activities', docId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<DocumentActivityList>(
        `/api/v1/documents/${docId}/activities?limit=${DOCUMENT_ACTIVITY_PAGE_SIZE}&offset=${pageParam}`,
      ),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((total, page) => total + page.items.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    enabled,
    retry: false,
  })
}

export type DocumentBucket = 'shared' | 'private' | 'archived'

export function useDocuments(
  projectId: string,
  bucket: DocumentBucket = 'shared',
  enabled = true,
) {
  return useQuery({
    queryKey: ['documents', projectId, bucket],
    queryFn: () =>
      api<DocumentList>(`/api/v1/projects/${projectId}/documents?bucket=${bucket}`),
    enabled,
  })
}

export function useWorkspaceDocuments(bucket: DocumentBucket = 'shared') {
  return useQuery({
    queryKey: ['workspace-documents', bucket],
    queryFn: () => api<DocumentList>(`/api/v1/documents?bucket=${bucket}`),
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
    mutationFn: (input: {
      title: string
      body?: string | null
      parent_id?: string | null
      visibility?: 'shared' | 'private'
    }) =>
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
      parent_id?: string | null
      visibility?: 'shared' | 'private'
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
      void queryClient.invalidateQueries({ queryKey: ['document-activities', doc.id] })
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

export type DocumentLink = {
  id: string
  project_id: string
  document_id: string
  work_package_id: string
  created_at: string
}

export function useDocLinks(docId: string | null) {
  return useQuery({
    queryKey: ['document-links', docId],
    queryFn: () =>
      api<{ items: DocumentLink[]; total: number }>(
        `/api/v1/documents/${docId}/work-package-links`,
      ),
    enabled: docId !== null,
  })
}

export function useCreateDocLink(docId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (work_package_id: string) =>
      api<DocumentLink>(`/api/v1/documents/${docId}/work-package-links`, {
        method: 'POST',
        body: JSON.stringify({ work_package_id }),
      }),
    onSuccess: (link) => {
      void queryClient.invalidateQueries({ queryKey: ['document-links', docId] })
      void queryClient.invalidateQueries({
        queryKey: ['work-package-documents', link.work_package_id],
      })
    },
  })
}

export function useDeleteDocLink(docId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (linkId: string) =>
      api<void>(`/api/v1/documents/${docId}/work-package-links/${linkId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['document-links', docId] })
      void queryClient.invalidateQueries({ queryKey: ['work-package-documents'] })
    },
  })
}

/** Reverse lookup for the WP drawer: documents linked to a work package. */
export function useLinkedDocuments(wpId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['work-package-documents', wpId],
    queryFn: () => api<DocumentList>(`/api/v1/work-packages/${wpId}/documents`),
    enabled: wpId !== null && enabled,
  })
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

export function useDocumentLifecycle(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      docId,
      expectedVersion,
      archived,
    }: {
      docId: string
      expectedVersion: number
      archived: boolean
    }) =>
      api<ProjectDocument>(`/api/v1/documents/${docId}/${archived ? 'archive' : 'restore'}`, {
        method: 'POST',
        body: JSON.stringify({ expected_version: expectedVersion }),
      }),
    onSuccess: (document) => {
      queryClient.setQueryData(['document', document.id], document)
      void queryClient.invalidateQueries({ queryKey: ['documents', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['work-package-documents'] })
      void queryClient.invalidateQueries({ queryKey: ['document-activities', document.id] })
    },
  })
}


export type DocumentComment = {
  id: string
  document_id: string
  project_id: string
  author_id: string | null
  body: string
  mentions: string[] | null
  anchor_id: string | null
  anchor_quote: string | null
  reactions: DocumentCommentReaction[]
  created_at: string
}

export type DocumentCommentReaction = {
  key: string
  count: number
  me: boolean
}

export type DocumentCommentList = { items: DocumentComment[]; total: number }

export function useDocumentComments(docId: string) {
  return useQuery({
    queryKey: ['document-comments', docId],
    queryFn: () => api<DocumentCommentList>(`/api/v1/documents/${docId}/comments`),
  })
}

export function useCreateDocumentComment(docId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { body: string; mentioned_user_ids: string[] }) =>
      api<DocumentComment>(`/api/v1/documents/${docId}/comments`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['document-comments', docId] })
    },
  })
}

export type InlineDocumentCommentInput = {
  body: string
  mentioned_user_ids?: string[]
  anchor_id: string
  anchor_quote: string
  expected_document_version?: number
  document_body?: string
}

export type InlineDocumentCommentResult = {
  comment: DocumentComment
  document: ProjectDocument
}

export function useCreateInlineDocumentComment(docId: string, projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: InlineDocumentCommentInput) =>
      api<InlineDocumentCommentResult>(`/api/v1/documents/${docId}/inline-comments`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: ({ comment, document }) => {
      queryClient.setQueryData(['document', document.id], document)
      queryClient.setQueryData<DocumentCommentList>(
        ['document-comments', docId],
        (current) =>
          current
            ? { items: [...current.items, comment], total: current.total + 1 }
            : { items: [comment], total: 1 },
      )
      void queryClient.invalidateQueries({ queryKey: ['documents', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['document-activities', document.id] })
    },
  })
}

export function useDeleteDocumentComment(docId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) =>
      api(`/api/v1/document-comments/${commentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['document-comments', docId] })
    },
  })
}

export function useToggleDocumentCommentReaction(docId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      commentId,
      key,
      on,
    }: {
      commentId: string
      key: string
      on: boolean
    }) =>
      api<{ items: DocumentCommentReaction[] }>(
        `/api/v1/document-comments/${commentId}/reactions/${encodeURIComponent(key)}`,
        { method: on ? 'PUT' : 'DELETE' },
      ).then((result) => ({ commentId, reactions: result.items })),
    onSuccess: ({ commentId, reactions }) => {
      queryClient.setQueryData<DocumentCommentList>(
        ['document-comments', docId],
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((comment) =>
                  comment.id === commentId ? { ...comment, reactions } : comment,
                ),
              }
            : current,
      )
    },
  })
}
