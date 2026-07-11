import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

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
    queryKey: ['milestones', projectId],
    queryFn: () => api<MilestoneList>(`/api/v1/projects/${projectId}/milestones`),
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
