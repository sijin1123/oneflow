import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, api } from '@/lib/api'

export type ActionItem = {
  id: string
  meeting_id: string
  description: string
  assignee_id: string | null
  done: boolean
  created_at: string
}

export type Meeting = {
  id: string
  project_id: string
  title: string
  scheduled_on: string | null
  agenda: string | null
  minutes: string | null
  author_id: string | null
  version: number
  created_at: string
  updated_at: string
  action_items: ActionItem[]
}

export type MeetingListItem = {
  id: string
  project_id: string
  title: string
  scheduled_on: string | null
  version: number
  updated_at: string
}

export type MeetingList = { items: MeetingListItem[]; total: number }
export type MeetingConflict = { detail: string; current: Meeting }

export function useMeetings(projectId: string) {
  return useQuery({
    queryKey: ['meetings', projectId],
    queryFn: () => api<MeetingList>(`/api/v1/projects/${projectId}/meetings`),
  })
}

export function useMeeting(meetingId: string | null) {
  return useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: () => api<Meeting>(`/api/v1/meetings/${meetingId}`),
    enabled: meetingId !== null,
  })
}

export function useCreateMeeting(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { title: string; scheduled_on?: string | null }) =>
      api<Meeting>(`/api/v1/projects/${projectId}/meetings`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meetings', projectId] }),
  })
}

export function useUpdateMeeting(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      meetingId: string
      expected_version: number
      title?: string
      scheduled_on?: string | null
      agenda?: string | null
      minutes?: string | null
    }) => {
      const { meetingId, ...patch } = input
      return api<Meeting>(`/api/v1/meetings/${meetingId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
    },
    onSuccess: (m) => {
      queryClient.setQueryData(['meeting', m.id], m)
      void queryClient.invalidateQueries({ queryKey: ['meetings', projectId] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        const current = (error.payload as MeetingConflict | null)?.current
        if (current) queryClient.setQueryData(['meeting', current.id], current)
      }
    },
  })
}

export function useDeleteMeeting(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (meetingId: string) =>
      api<void>(`/api/v1/meetings/${meetingId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meetings', projectId] }),
  })
}

function useActionItemMutation(meetingId: string) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
  return { queryClient, invalidate }
}

export function useAddActionItem(meetingId: string) {
  const { invalidate } = useActionItemMutation(meetingId)
  return useMutation({
    mutationFn: (input: { description: string; assignee_id?: string | null }) =>
      api<ActionItem>(`/api/v1/meetings/${meetingId}/action-items`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => void invalidate(),
  })
}

export function useToggleActionItem(meetingId: string) {
  const { invalidate } = useActionItemMutation(meetingId)
  return useMutation({
    mutationFn: (input: { id: string; done: boolean }) =>
      api<ActionItem>(`/api/v1/action-items/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ done: input.done }),
      }),
    onSuccess: () => void invalidate(),
  })
}

export function useDeleteActionItem(meetingId: string) {
  const { invalidate } = useActionItemMutation(meetingId)
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/v1/action-items/${id}`, { method: 'DELETE' }),
    onSuccess: () => void invalidate(),
  })
}
