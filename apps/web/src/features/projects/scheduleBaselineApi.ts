import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { components } from '@shared/api-types'

import { api } from '@/lib/api'

type Schemas = components['schemas']

export type ProjectScheduleBaselineSummary = Schemas['ProjectScheduleBaselineSummary']
export type ProjectScheduleVarianceItem = Schemas['ProjectScheduleVarianceItem']
export type ScheduleVarianceState = ProjectScheduleVarianceItem['state']

const queryKey = (projectId: string) => ['project-schedule-baseline', projectId] as const

export function useProjectScheduleBaseline(projectId: string) {
  return useQuery({
    queryKey: queryKey(projectId),
    queryFn: () =>
      api<ProjectScheduleBaselineSummary>(
        `/api/v1/projects/${projectId}/schedule-baseline`,
      ),
    enabled: Boolean(projectId),
  })
}

export function useCaptureProjectScheduleBaseline(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (expectedVersion: number | null) =>
      api<ProjectScheduleBaselineSummary>(
        `/api/v1/projects/${projectId}/schedule-baseline`,
        {
          method: 'PUT',
          body: JSON.stringify({ expected_version: expectedVersion }),
        },
      ),
    onSuccess: (summary) => {
      queryClient.setQueryData(queryKey(projectId), summary)
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKey(projectId) }),
  })
}

export function useDeleteProjectScheduleBaseline(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (expectedVersion: number) => {
      const params = new URLSearchParams({ expected_version: String(expectedVersion) })
      return api<void>(
        `/api/v1/projects/${projectId}/schedule-baseline?${params.toString()}`,
        { method: 'DELETE' },
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKey(projectId) }),
  })
}
