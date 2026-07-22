import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { ApiError, BASE_URL, api } from '@/lib/api'

export type Attachment = {
  id: string
  project_id: string
  work_package_id: string | null
  document_id: string | null
  filename: string
  content_type: string | null
  size_bytes: number | null
  url: string
  has_file: boolean
  search_index_status:
    | 'not_applicable'
    | 'pending'
    | 'indexed'
    | 'unsupported'
    | 'too_large'
    | 'invalid_text'
    | 'missing_blob'
  search_indexed_at: string | null
  uploaded_by: string | null
  created_at: string
}

export type AttachmentList = { items: Attachment[]; total: number }

export type AttachmentDirectoryItem = Attachment & {
  work_package_subject: string | null
  document_title: string | null
}

export type AttachmentDirectoryScope = 'all' | 'files' | 'links' | 'linked' | 'pending'

export type AttachmentDirectorySummary = {
  total: number
  file_count: number
  link_count: number
  linked_count: number
  indexed_file_count: number
  pending_index_count: number
  used_bytes: number
}

export type AttachmentDirectoryList = {
  items: AttachmentDirectoryItem[]
  total: number
  summary: AttachmentDirectorySummary
  next_cursor_created_at: string | null
  next_cursor_id: string | null
  highlight_item: AttachmentDirectoryItem | null
}

type AttachmentDirectoryCursor = {
  createdAt: string
  id: string
}

const ATTACHMENT_DIRECTORY_PAGE_SIZE = 50

export function useAttachmentDirectory({
  projectId,
  q,
  scope,
  highlightId,
}: {
  projectId: string
  q: string
  scope: AttachmentDirectoryScope
  highlightId: string | null
}) {
  return useInfiniteQuery({
    queryKey: ['attachments', projectId, 'directory', { q, scope, highlightId }],
    initialPageParam: null as AttachmentDirectoryCursor | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(ATTACHMENT_DIRECTORY_PAGE_SIZE),
        scope,
      })
      if (q) params.set('q', q)
      if (highlightId) params.set('highlight_id', highlightId)
      if (pageParam) {
        params.set('cursor_created_at', pageParam.createdAt)
        params.set('cursor_id', pageParam.id)
      }
      return api<AttachmentDirectoryList>(
        `/api/v1/projects/${projectId}/attachments/directory?${params.toString()}`,
      )
    },
    getNextPageParam: (lastPage) =>
      lastPage.next_cursor_created_at && lastPage.next_cursor_id
        ? {
            createdAt: lastPage.next_cursor_created_at,
            id: lastPage.next_cursor_id,
          }
        : undefined,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export type AttachmentSearchReindexResult = {
  processed: number
  indexed: number
  remaining: number
  statuses: Record<string, number>
}

export function useAttachments(projectId: string) {
  return useQuery({
    queryKey: ['attachments', projectId],
    queryFn: () => api<AttachmentList>(`/api/v1/projects/${projectId}/attachments`),
  })
}

export function useCreateAttachment(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      filename: string
      url: string
      content_type?: string | null
      size_bytes?: number | null
      work_package_id?: string | null
      document_id?: string | null
    }) =>
      api<Attachment>(`/api/v1/projects/${projectId}/attachments`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attachments', projectId] }),
  })
}

export function useDeleteAttachment(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/v1/attachments/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attachments', projectId] }),
  })
}

export function useUploadAttachment(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    // Raw body (no multipart): the filename travels in the query string and the
    // file's own type in Content-Type — mirrors the server's streaming protocol.
    mutationFn: async ({
      file,
      workPackageId,
      documentId,
    }: {
      file: File
      workPackageId?: string
      documentId?: string
    }) => {
      const anchor = workPackageId
        ? `&work_package_id=${workPackageId}`
        : documentId
          ? `&document_id=${documentId}`
          : ''
      const res = await fetch(
        `${BASE_URL}/api/v1/projects/${projectId}/attachments/upload?filename=${encodeURIComponent(file.name)}${anchor}`,
        {
          method: 'POST',
          headers: { 'content-type': file.type || 'application/octet-stream' },
          body: file,
        },
      )
      if (!res.ok) {
        let detail = `HTTP ${res.status}`
        try {
          const payload = (await res.json()) as { detail?: string }
          if (payload.detail) detail = payload.detail
        } catch {
          /* non-JSON error body */
        }
        throw new ApiError(res.status, detail, res.headers.get('x-request-id'), null)
      }
      return (await res.json()) as Attachment
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attachments', projectId] })
    },
  })
}

export function useRebuildAttachmentSearchIndex(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<AttachmentSearchReindexResult>(
        `/api/v1/projects/${projectId}/attachments/search-index/rebuild`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attachments', projectId] })
      void queryClient.removeQueries({ queryKey: ['unified-search'] })
      void queryClient.removeQueries({ queryKey: ['command-palette-search'] })
    },
  })
}

export function downloadUrl(attachmentId: string): string {
  return `${BASE_URL}/api/v1/attachments/${attachmentId}/download`
}

/** Attachments anchored to one work package — the drawer's 첨부 section. */
export function useWpAttachments(projectId: string, wpId: string | null) {
  return useQuery({
    queryKey: ['attachments', projectId, 'wp', wpId],
    queryFn: () =>
      api<AttachmentList>(
        `/api/v1/projects/${projectId}/attachments?work_package_id=${wpId}`,
      ),
    enabled: wpId !== null,
  })
}

/** Attachments anchored to one document — the editor's 첨부 section. */
export function useDocumentAttachments(projectId: string, docId: string | null) {
  return useQuery({
    queryKey: ['attachments', projectId, 'doc', docId],
    queryFn: () =>
      api<AttachmentList>(`/api/v1/projects/${projectId}/attachments?document_id=${docId}`),
    enabled: docId !== null,
  })
}
