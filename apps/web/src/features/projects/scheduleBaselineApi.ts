import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { components } from '@shared/api-types'

import { api } from '@/lib/api'

type Schemas = components['schemas']

export type ProjectScheduleBaselineList = Schemas['ProjectScheduleBaselineList']
export type ProjectScheduleBaselineListItem = Schemas['ProjectScheduleBaselineListItem']
export type ProjectScheduleBaselineSummary = Schemas['ProjectScheduleBaselineSummary']
export type ProjectScheduleVarianceItem = Schemas['ProjectScheduleVarianceItem']
export type ScheduleVarianceState = ProjectScheduleVarianceItem['state']

const historyKey = (projectId: string) => ['project-schedule-baselines', projectId] as const
const detailKey = (projectId: string, baselineId: string) =>
  ['project-schedule-baselines', projectId, baselineId] as const

export function useProjectScheduleBaselines(projectId: string) {
  return useQuery({
    queryKey: historyKey(projectId),
    queryFn: () =>
      api<ProjectScheduleBaselineList>(
        `/api/v1/projects/${projectId}/schedule-baselines`,
      ),
    enabled: Boolean(projectId),
  })
}

export function useProjectScheduleBaseline(projectId: string, baselineId: string) {
  return useQuery({
    queryKey: detailKey(projectId, baselineId),
    queryFn: () =>
      api<ProjectScheduleBaselineSummary>(
        `/api/v1/projects/${projectId}/schedule-baselines/${baselineId}`,
      ),
    enabled: Boolean(projectId && baselineId),
  })
}

export function useCreateProjectScheduleBaseline(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      api<ProjectScheduleBaselineSummary>(
        `/api/v1/projects/${projectId}/schedule-baselines`,
        {
          method: 'POST',
          body: JSON.stringify({ name }),
        },
      ),
    onSuccess: (summary) => {
      if (summary.baseline) {
        queryClient.setQueryData(
          detailKey(projectId, summary.baseline.id),
          summary,
        )
        queryClient.setQueryData<ProjectScheduleBaselineList>(
          historyKey(projectId),
          (current) => current
            ? {
                ...current,
                items: [
                  {
                    ...summary.baseline!,
                    total_snapshot: summary.total_snapshot,
                  },
                  ...current.items,
                ],
                total: current.total + 1,
                current_total: summary.current_total,
              }
            : current,
        )
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: historyKey(projectId) }),
  })
}

export function useDeleteProjectScheduleBaseline(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ baselineId, expectedVersion }: { baselineId: string; expectedVersion: number }) => {
      const params = new URLSearchParams({ expected_version: String(expectedVersion) })
      return api<void>(
        `/api/v1/projects/${projectId}/schedule-baselines/${baselineId}?${params.toString()}`,
        { method: 'DELETE' },
      )
    },
    onSuccess: (_, variables) => {
      queryClient.removeQueries({ queryKey: detailKey(projectId, variables.baselineId) })
      queryClient.setQueryData<ProjectScheduleBaselineList>(
        historyKey(projectId),
        (current) => {
          if (!current) return current
          const items = current.items.filter((item) => item.id !== variables.baselineId)
          return items.length === current.items.length
            ? current
            : { ...current, items, total: Math.max(0, current.total - 1) }
        },
      )
    },
    onError: (_error, variables) => queryClient.invalidateQueries({
      queryKey: detailKey(projectId, variables.baselineId),
    }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: historyKey(projectId) }),
  })
}
