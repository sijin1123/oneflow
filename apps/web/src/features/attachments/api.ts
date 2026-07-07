import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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
  uploaded_by: string | null
  created_at: string
}

export type AttachmentList = { items: Attachment[]; total: number }

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
    mutationFn: async ({ file, workPackageId }: { file: File; workPackageId?: string }) => {
      const anchor = workPackageId ? `&work_package_id=${workPackageId}` : ''
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
