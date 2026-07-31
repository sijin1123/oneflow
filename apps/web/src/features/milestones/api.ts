import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { registerIdentityReset } from '@/features/auth/cache'
import { api } from '@/lib/api'
import { queryClient as appQueryClient } from '@/lib/query'

type MilestoneRequestState = {
  requestVersion: number
  successfulRequestVersion: number
  dataUpdateCountAtStart: number
}

const milestoneRequestStates = new Map<string, MilestoneRequestState>()
const emptyMilestoneRequestState: MilestoneRequestState = {
  requestVersion: 0,
  successfulRequestVersion: 0,
  dataUpdateCountAtStart: 0,
}

function milestoneQueryKey(projectId: string) {
  return ['milestones', projectId] as const
}

export function getMilestoneRequestState(projectId: string) {
  return milestoneRequestStates.get(projectId) ?? emptyMilestoneRequestState
}

function startMilestoneRequest(projectId: string) {
  const previous = getMilestoneRequestState(projectId)
  const requestVersion = previous.requestVersion + 1
  milestoneRequestStates.set(projectId, {
    requestVersion,
    successfulRequestVersion: previous.successfulRequestVersion,
    dataUpdateCountAtStart:
      appQueryClient.getQueryState(milestoneQueryKey(projectId))?.dataUpdateCount ?? 0,
  })
  return requestVersion
}

function completeMilestoneRequest(projectId: string, requestVersion: number) {
  const current = getMilestoneRequestState(projectId)
  if (current.requestVersion !== requestVersion) return
  milestoneRequestStates.set(projectId, {
    ...current,
    successfulRequestVersion: requestVersion,
  })
}

export function isMilestoneRequestAccepted(projectId: string) {
  const request = getMilestoneRequestState(projectId)
  const query = appQueryClient.getQueryState(milestoneQueryKey(projectId))
  return Boolean(
    query &&
      query.fetchStatus === 'idle' &&
      request.requestVersion === request.successfulRequestVersion &&
      query.dataUpdateCount > request.dataUpdateCountAtStart,
  )
}

registerIdentityReset(() => milestoneRequestStates.clear())

export type Milestone = {
  id: string
  project_id: string
  name: string
  description: string | null
  due_date: string | null
  work_package_count: number
  done_work_package_count: number
  created_at: string
  updated_at: string
}

export type MilestoneList = { items: Milestone[]; total: number }

export function useMilestones(projectId: string, enabled = true) {
  return useQuery({
    queryKey: milestoneQueryKey(projectId),
    queryFn: async () => {
      const requestVersion = startMilestoneRequest(projectId)
      const milestones = await api<MilestoneList>(
        `/api/v1/projects/${projectId}/milestones`,
      )
      completeMilestoneRequest(projectId, requestVersion)
      return milestones
    },
    enabled: enabled && Boolean(projectId),
  })
}

export function useCreateMilestone(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; due_date: string | null }) =>
      api<Milestone>(`/api/v1/projects/${projectId}/milestones`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['milestones', projectId] })
    },
  })
}

export function useUpdateMilestone(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      milestoneId,
      ...input
    }: {
      milestoneId: string
      name?: string
      due_date?: string | null
    }) =>
      api<Milestone>(`/api/v1/projects/${projectId}/milestones/${milestoneId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['milestones', projectId] })
    },
  })
}

export function useDeleteMilestone(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (milestoneId: string) =>
      api<void>(`/api/v1/projects/${projectId}/milestones/${milestoneId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['milestones', projectId] })
    },
  })
}
