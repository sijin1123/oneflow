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

export type IntakeDecisionHistoryItem = {
  id: string
  intake_item_id: string
  previous_status: IntakeStatus
  status: Exclude<IntakeStatus, 'pending'>
  note: string | null
  snooze_until: string | null
  decided_by: string | null
  decided_by_name: string | null
  decided_by_profile_image_url: string | null
  created_at: string
}

export type IntakeDecisionHistoryList = {
  items: IntakeDecisionHistoryItem[]
  total: number
}

export function useIntake(projectId: string) {
  return useQuery({
    queryKey: ['intake', projectId],
    queryFn: () => api<IntakeList>(`/api/v1/projects/${projectId}/intake`),
  })
}

export function useIntakeDecisionHistory(projectId: string, itemId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['intake-history', projectId, itemId],
    queryFn: () =>
      api<IntakeDecisionHistoryList>(
        `/api/v1/projects/${projectId}/intake/${itemId}/history`,
      ),
    enabled,
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
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['intake', projectId] })
      void queryClient.invalidateQueries({
        queryKey: ['intake-history', projectId, variables.itemId],
      })
      void queryClient.invalidateQueries({ queryKey: ['work-packages', projectId] })
    },
  })
}
