import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type WorkspaceQuickLink = {
  id: string
  title: string
  destination: string
  position: number
  version: number
  created_at: string
  updated_at: string
}

export type WorkspaceQuickLinkList = {
  items: WorkspaceQuickLink[]
  total: number
}

const QUERY_KEY = ['workspace-quick-links'] as const

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: QUERY_KEY })
}

export function useWorkspaceQuickLinks() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api<WorkspaceQuickLinkList>('/api/v1/me/quick-links'),
  })
}

export function useCreateWorkspaceQuickLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { title: string; destination: string }) =>
      api<WorkspaceQuickLink>('/api/v1/me/quick-links', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => void invalidate(queryClient),
  })
}

export function useUpdateWorkspaceQuickLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string
      expected_version: number
      title: string
      destination: string
    }) =>
      api<WorkspaceQuickLink>(`/api/v1/me/quick-links/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => void invalidate(queryClient),
  })
}

export function useDeleteWorkspaceQuickLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion: number }) =>
      api<void>(`/api/v1/me/quick-links/${id}?expected_version=${expectedVersion}`, {
        method: 'DELETE',
      }),
    onSuccess: () => void invalidate(queryClient),
  })
}

export function useOrderWorkspaceQuickLinks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (items: Array<{ id: string; expected_version: number }>) =>
      api<WorkspaceQuickLinkList>('/api/v1/me/quick-links/order', {
        method: 'PUT',
        body: JSON.stringify({ items }),
      }),
    onSuccess: () => void invalidate(queryClient),
  })
}
