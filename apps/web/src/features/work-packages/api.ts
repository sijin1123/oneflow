import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, api } from '@/lib/api'
import { decideOnPatchError } from '@/lib/conflict'

import type { ConflictBody, RelationList, WorkPackage, WorkPackageList, WorkPackagePatch } from './types'

export type WpFilters = { status?: string; priority?: string; type?: string; q?: string }

export function useWorkPackages(projectId: string, filters: WpFilters) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value)
  }
  const qs = params.toString()
  return useQuery({
    queryKey: ['work-packages', projectId, filters],
    queryFn: () =>
      api<WorkPackageList>(`/api/v1/projects/${projectId}/work-packages${qs ? `?${qs}` : ''}`),
  })
}

export function useWorkPackage(wpId: string | null) {
  return useQuery({
    queryKey: ['work-package', wpId],
    queryFn: () => api<WorkPackage>(`/api/v1/work-packages/${wpId}`),
    enabled: wpId !== null,
  })
}

export function useRelations(wpId: string | null) {
  return useQuery({
    queryKey: ['work-package-relations', wpId],
    queryFn: () => api<RelationList>(`/api/v1/work-packages/${wpId}/relations`),
    enabled: wpId !== null,
  })
}

export function useCreateWorkPackage(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { subject: string }) =>
      api<WorkPackage>(`/api/v1/projects/${projectId}/work-packages`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['work-packages', projectId] })
    },
  })
}

/** PATCH with optimistic-concurrency handling: on 409 the conflict decision
 *  (pure function, unit-tested) notifies + invalidates so the UI reloads the
 *  fresh resource (PLAN §6.2/§8). */
export function usePatchWorkPackage(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ wpId, patch }: { wpId: string; patch: WorkPackagePatch }) =>
      api<WorkPackage>(`/api/v1/work-packages/${wpId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['work-package', updated.id], updated)
      void queryClient.invalidateQueries({ queryKey: ['work-packages', projectId] })
    },
    onError: (error, { wpId }) => {
      if (!(error instanceof ApiError)) return
      const decision = decideOnPatchError(error.status)
      if (decision.notify && decision.message) {
        // Slice-level notice; a toast system is a follow-up.
        window.alert(decision.message)
      }
      if (decision.invalidate) {
        const conflict = error.payload as ConflictBody | null
        if (conflict?.current) {
          queryClient.setQueryData(['work-package', wpId], conflict.current)
        }
        void queryClient.invalidateQueries({ queryKey: ['work-package', wpId] })
        void queryClient.invalidateQueries({ queryKey: ['work-packages', projectId] })
      }
    },
  })
}
