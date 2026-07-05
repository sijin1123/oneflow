import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type Attachment = {
  id: string
  project_id: string
  filename: string
  content_type: string | null
  size_bytes: number | null
  url: string
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
