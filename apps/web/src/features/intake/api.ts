import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type IntakeStatus = 'pending' | 'accepted' | 'declined' | 'snoozed' | 'duplicate'

export type IntakeItem = {
  id: string
  project_id: string
  title: string
  body: string | null
  status: IntakeStatus
  submitted_by: string | null
  submitter_name: string | null
  snooze_until: string | null
  accepted_wp_id: string | null
  triage_note: string | null
  triaged_by_id: string | null
  triaged_at: string | null
  created_at: string
  updated_at: string
}

export type IntakeList = { items: IntakeItem[]; total: number }

export function useIntake(projectId: string) {
  return useQuery({
    queryKey: ['intake', projectId],
    queryFn: () => api<IntakeList>(`/api/v1/projects/${projectId}/intake`),
  })
}

export function useSubmitIntake(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { title: string; body?: string | null }) =>
      api<IntakeItem>(`/api/v1/projects/${projectId}/intake`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['intake', projectId] })
    },
  })
}

export function useTriageIntake(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      itemId,
      ...input
    }: {
      itemId: string
      status: Exclude<IntakeStatus, 'pending'>
      snooze_until?: string | null
      note?: string | null
    }) =>
      api<IntakeItem>(`/api/v1/projects/${projectId}/intake/${itemId}/triage`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['intake', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['work-packages', projectId] })
    },
  })
}
