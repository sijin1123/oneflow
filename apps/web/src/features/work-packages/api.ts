import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, api } from '@/lib/api'
import { decideOnPatchError } from '@/lib/conflict'

import type {
  ActivityList,
  Comment,
  CommentList,
  ConflictBody,
  CostEntryList,
  RelationList,
  TimeEntryList,
  WorkPackage,
  WorkPackageList,
  WorkPackagePatch,
} from './types'

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

export function useCreateRelation(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { target_id: string; relation_type: string }) =>
      api(`/api/v1/work-packages/${wpId}/relations`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['work-package-relations', wpId] })
    },
  })
}

export function useDeleteRelation(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (relationId: string) =>
      api<void>(`/api/v1/work-packages/${wpId}/relations/${relationId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['work-package-relations', wpId] })
    },
  })
}

export function useTimeEntries(wpId: string | null) {
  return useQuery({
    queryKey: ['time-entries', wpId],
    queryFn: () => api<TimeEntryList>(`/api/v1/work-packages/${wpId}/time-entries`),
    enabled: wpId !== null,
  })
}

export function useLogTime(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { hours: number; spent_on: string; comment: string | null }) =>
      api(`/api/v1/work-packages/${wpId}/time-entries`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['time-entries', wpId] })
    },
  })
}

export function useDeleteTimeEntry(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) =>
      api<void>(`/api/v1/work-packages/${wpId}/time-entries/${entryId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['time-entries', wpId] })
    },
  })
}

export function useCostEntries(wpId: string | null) {
  return useQuery({
    queryKey: ['cost-entries', wpId],
    queryFn: () => api<CostEntryList>(`/api/v1/work-packages/${wpId}/cost-entries`),
    enabled: wpId !== null,
  })
}

export function useLogCost(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      amount: number
      kind: string
      spent_on: string
      comment: string | null
    }) =>
      api(`/api/v1/work-packages/${wpId}/cost-entries`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cost-entries', wpId] })
    },
  })
}

export function useDeleteCostEntry(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) =>
      api<void>(`/api/v1/work-packages/${wpId}/cost-entries/${entryId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cost-entries', wpId] })
    },
  })
}

export function useComments(wpId: string | null) {
  return useQuery({
    queryKey: ['work-package-comments', wpId],
    queryFn: () => api<CommentList>(`/api/v1/work-packages/${wpId}/comments`),
    enabled: wpId !== null,
  })
}

export function useActivities(wpId: string | null) {
  return useQuery({
    queryKey: ['work-package-activities', wpId],
    queryFn: () => api<ActivityList>(`/api/v1/work-packages/${wpId}/activities`),
    enabled: wpId !== null,
  })
}

export function useCreateComment(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) =>
      api<Comment>(`/api/v1/work-packages/${wpId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      // A comment also appends a 'commented' activity — refresh both.
      void queryClient.invalidateQueries({ queryKey: ['work-package-comments', wpId] })
      void queryClient.invalidateQueries({ queryKey: ['work-package-activities', wpId] })
    },
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
