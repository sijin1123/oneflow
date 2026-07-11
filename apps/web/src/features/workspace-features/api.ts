import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { aiCapabilitiesKey, type AiCapabilities } from '@/features/ai/api'

import {
  clearCustomersDataCache,
  clearInitiativesDataCache,
  clearReleasesDataCache,
  clearWikiDataCache,
  mergeWorkspaceCapability,
} from './cache'

export type WorkspaceFeatureCapability = {
  enabled: boolean
  revision: number
}

export type WorkspaceCapabilities = {
  wiki: WorkspaceFeatureCapability
  ai: WorkspaceFeatureCapability & {
    deployment_enabled: boolean
    effective_enabled: boolean
  }
  initiatives: WorkspaceFeatureCapability
  releases: WorkspaceFeatureCapability
  customers: WorkspaceFeatureCapability
}

export type WorkspaceFeaturePolicy = WorkspaceFeatureCapability & {
  feature_key: 'wiki'
  updated_by_user_id: string | null
  updated_by_name: string | null
  updated_at: string
}

export type AiWorkspaceFeaturePolicy = WorkspaceFeatureCapability & {
  feature_key: 'ai'
  deployment_enabled: boolean
  effective_enabled: boolean
  updated_by_user_id: string | null
  updated_by_name: string | null
  updated_at: string
}

export type InitiativesWorkspaceFeaturePolicy = WorkspaceFeatureCapability & {
  feature_key: 'initiatives'
  updated_by_user_id: string | null
  updated_by_name: string | null
  updated_at: string
}

export type ReleasesWorkspaceFeaturePolicy = WorkspaceFeatureCapability & {
  feature_key: 'releases'
  updated_by_user_id: string | null
  updated_by_name: string | null
  updated_at: string
}

export type CustomersWorkspaceFeaturePolicy = WorkspaceFeatureCapability & {
  feature_key: 'customers'
  updated_by_user_id: string | null
  updated_by_name: string | null
  updated_at: string
}

export const workspaceCapabilitiesKey = ['workspace-capabilities'] as const
export const wikiPolicyKey = ['admin-workspace-feature', 'wiki'] as const
export const aiPolicyKey = ['admin-workspace-feature', 'ai'] as const
export const initiativesPolicyKey = ['admin-workspace-feature', 'initiatives'] as const
export const releasesPolicyKey = ['admin-workspace-feature', 'releases'] as const
export const customersPolicyKey = ['admin-workspace-feature', 'customers'] as const

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
      queryClient.setQueryData<WorkspaceCapabilities>(workspaceCapabilitiesKey, (current) =>
        mergeWorkspaceCapability(current, 'wiki', {
          enabled: policy.enabled,
          revision: policy.revision,
        }),
      )
      clearWikiDataCache(queryClient)
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: wikiPolicyKey })
      void queryClient.invalidateQueries({ queryKey: workspaceCapabilitiesKey })
    },
  })
}

export function useAiPolicy() {
  return useQuery({
    queryKey: aiPolicyKey,
    queryFn: () => api<AiWorkspaceFeaturePolicy>('/api/v1/admin/workspace/features/ai'),
  })
}

export function useUpdateAiPolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ enabled, revision }: WorkspaceFeatureCapability) =>
      api<AiWorkspaceFeaturePolicy>('/api/v1/admin/workspace/features/ai', {
        method: 'PATCH',
        headers: { 'If-Match': `"${revision}"` },
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: (policy) => {
      queryClient.setQueryData(aiPolicyKey, policy)
      queryClient.setQueryData<WorkspaceCapabilities>(workspaceCapabilitiesKey, (current) =>
        mergeWorkspaceCapability(current, 'ai', {
          enabled: policy.enabled,
          revision: policy.revision,
          deployment_enabled: policy.deployment_enabled,
          effective_enabled: policy.effective_enabled,
        }),
      )
      queryClient.setQueryData<AiCapabilities>(aiCapabilitiesKey, {
        ai_summary_enabled: policy.effective_enabled,
      })
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: aiPolicyKey })
      void queryClient.invalidateQueries({ queryKey: aiCapabilitiesKey })
    },
  })
}

export function useInitiativesPolicy() {
  return useQuery({
    queryKey: initiativesPolicyKey,
    queryFn: () =>
      api<InitiativesWorkspaceFeaturePolicy>(
        '/api/v1/admin/workspace/features/initiatives',
      ),
  })
}

export function useUpdateInitiativesPolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ enabled, revision }: WorkspaceFeatureCapability) =>
      api<InitiativesWorkspaceFeaturePolicy>(
        '/api/v1/admin/workspace/features/initiatives',
        {
          method: 'PATCH',
          headers: { 'If-Match': `"${revision}"` },
          body: JSON.stringify({ enabled }),
        },
      ),
    onSuccess: (policy) => {
      queryClient.setQueryData(initiativesPolicyKey, policy)
      queryClient.setQueryData<WorkspaceCapabilities>(workspaceCapabilitiesKey, (current) =>
        mergeWorkspaceCapability(current, 'initiatives', {
          enabled: policy.enabled,
          revision: policy.revision,
        }),
      )
      clearInitiativesDataCache(queryClient)
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: initiativesPolicyKey })
      void queryClient.invalidateQueries({ queryKey: workspaceCapabilitiesKey })
    },
  })
}

export function useReleasesPolicy() {
  return useQuery({
    queryKey: releasesPolicyKey,
    queryFn: () =>
      api<ReleasesWorkspaceFeaturePolicy>('/api/v1/admin/workspace/features/releases'),
  })
}

export function useUpdateReleasesPolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ enabled, revision }: WorkspaceFeatureCapability) =>
      api<ReleasesWorkspaceFeaturePolicy>('/api/v1/admin/workspace/features/releases', {
        method: 'PATCH',
        headers: { 'If-Match': `"${revision}"` },
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: (policy) => {
      queryClient.setQueryData(releasesPolicyKey, policy)
      queryClient.setQueryData<WorkspaceCapabilities>(workspaceCapabilitiesKey, (current) =>
        mergeWorkspaceCapability(current, 'releases', {
          enabled: policy.enabled,
          revision: policy.revision,
        }),
      )
      clearReleasesDataCache(queryClient)
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: releasesPolicyKey })
      void queryClient.invalidateQueries({ queryKey: workspaceCapabilitiesKey })
    },
  })
}

export function useCustomersPolicy() {
  return useQuery({
    queryKey: customersPolicyKey,
    queryFn: () =>
      api<CustomersWorkspaceFeaturePolicy>('/api/v1/admin/workspace/features/customers'),
  })
}

export function useUpdateCustomersPolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ enabled, revision }: WorkspaceFeatureCapability) =>
      api<CustomersWorkspaceFeaturePolicy>('/api/v1/admin/workspace/features/customers', {
        method: 'PATCH',
        headers: { 'If-Match': `"${revision}"` },
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: (policy) => {
      queryClient.setQueryData(customersPolicyKey, policy)
      queryClient.setQueryData<WorkspaceCapabilities>(workspaceCapabilitiesKey, (current) =>
        mergeWorkspaceCapability(current, 'customers', {
          enabled: policy.enabled,
          revision: policy.revision,
        }),
      )
      clearCustomersDataCache(queryClient)
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: customersPolicyKey })
      void queryClient.invalidateQueries({ queryKey: workspaceCapabilitiesKey })
    },
  })
}
