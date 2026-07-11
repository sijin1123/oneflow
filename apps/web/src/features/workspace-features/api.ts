import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

import { clearWikiDataCache } from './cache'

export type WorkspaceFeatureCapability = {
  enabled: boolean
  revision: number
}

export type WorkspaceCapabilities = {
  wiki: WorkspaceFeatureCapability
}

export type WorkspaceFeaturePolicy = WorkspaceFeatureCapability & {
  feature_key: 'wiki'
  updated_by_user_id: string | null
  updated_by_name: string | null
  updated_at: string
}

export const workspaceCapabilitiesKey = ['workspace-capabilities'] as const
export const wikiPolicyKey = ['admin-workspace-feature', 'wiki'] as const

export function useWorkspaceCapabilities() {
  return useQuery({
    queryKey: workspaceCapabilitiesKey,
    queryFn: () => api<WorkspaceCapabilities>('/api/v1/workspace/capabilities'),
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
}

export function useWikiPolicy() {
  return useQuery({
    queryKey: wikiPolicyKey,
    queryFn: () =>
      api<WorkspaceFeaturePolicy>('/api/v1/admin/workspace/features/wiki'),
  })
}

export function useUpdateWikiPolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ enabled, revision }: WorkspaceFeatureCapability) =>
      api<WorkspaceFeaturePolicy>('/api/v1/admin/workspace/features/wiki', {
        method: 'PATCH',
        headers: { 'If-Match': `"${revision}"` },
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: (policy) => {
      queryClient.setQueryData(wikiPolicyKey, policy)
      queryClient.setQueryData<WorkspaceCapabilities>(workspaceCapabilitiesKey, {
        wiki: { enabled: policy.enabled, revision: policy.revision },
      })
      clearWikiDataCache(queryClient)
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: wikiPolicyKey })
      void queryClient.invalidateQueries({ queryKey: workspaceCapabilitiesKey })
    },
  })
}
