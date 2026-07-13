import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { components } from '@shared/api-types'

import { ApiError, api } from '@/lib/api'

type Schemas = components['schemas']

export type WorkspaceSavedView = Schemas['WorkspaceSavedViewRead']
export type WorkspaceSavedViewList = Schemas['WorkspaceSavedViewList']
export type WorkspaceSavedViewParams = Schemas['WorkspaceSavedViewParams']

const queryKey = ['workspace-saved-views'] as const

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey })
}

function invalidateConflict(queryClient: ReturnType<typeof useQueryClient>, error: Error) {
  if (error instanceof ApiError && error.status === 409) void invalidate(queryClient)
}

function upsertCachedView(
  queryClient: ReturnType<typeof useQueryClient>,
  view: WorkspaceSavedView,
) {
  queryClient.setQueryData<WorkspaceSavedViewList>(queryKey, (current) => {
    const items = [view, ...(current?.items ?? []).filter((item) => item.id !== view.id)]
    return { items, total: items.length }
  })
}

function removeCachedView(
  queryClient: ReturnType<typeof useQueryClient>,
  viewId: string,
) {
  queryClient.setQueryData<WorkspaceSavedViewList>(queryKey, (current) => {
    if (!current) return current
    const items = current.items.filter((item) => item.id !== viewId)
    return { items, total: items.length }
  })
}

export function useWorkspaceSavedViews() {
  return useQuery({
    queryKey,
    queryFn: () => api<WorkspaceSavedViewList>('/api/v1/me/workspace-views'),
  })
}

export function useCreateWorkspaceSavedView() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; params: WorkspaceSavedViewParams }) =>
      api<WorkspaceSavedView>('/api/v1/me/workspace-views', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (created) => {
      upsertCachedView(queryClient, created)
      void invalidate(queryClient)
    },
  })
}

export function useUpdateWorkspaceSavedView() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: {
      id: string
      expected_version: number
      name?: string
      params?: WorkspaceSavedViewParams
    }) => api<WorkspaceSavedView>(`/api/v1/me/workspace-views/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
    onSuccess: (updated) => {
      upsertCachedView(queryClient, updated)
      void invalidate(queryClient)
    },
    onError: (error) => invalidateConflict(queryClient, error),
  })
}

export function useDeleteWorkspaceSavedView() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion: number }) =>
      api<void>(`/api/v1/me/workspace-views/${id}?expected_version=${expectedVersion}`, {
        method: 'DELETE',
      }),
    onSuccess: (_, input) => {
      removeCachedView(queryClient, input.id)
      void invalidate(queryClient)
    },
    onError: (error) => invalidateConflict(queryClient, error),
  })
}
