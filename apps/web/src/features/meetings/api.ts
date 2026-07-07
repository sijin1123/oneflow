import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, api } from '@/lib/api'

export type ActionItem = {
  converted_wp_id: string | null
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
    mutationFn: (input: { title: string; scheduled_on?: string | null; template_id?: string }) =>
      api<Meeting>(`/api/v1/projects/${projectId}/meetings`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meetings', projectId] }),
  })
}

export function useCreateFollowUp(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (meetingId: string) =>
      api<Meeting>(`/api/v1/meetings/${meetingId}/follow-up`, {
        method: 'POST',
        body: JSON.stringify({}),
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
    // On a 409 we intentionally do NOT overwrite the cached meeting: that would
    // trip the detail page's resync effect and discard the user's unsaved edits.
    // The page reads the conflict version and lets the user retry without loss.
  })
}

export function conflictOf(error: unknown): MeetingConflict | null {
  if (error instanceof ApiError && error.status === 409) {
    return (error.payload as MeetingConflict | null) ?? null
  }
  return null
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

export function useConvertActionItem(meetingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<ActionItem>(`/api/v1/action-items/${id}/convert`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
    },
  })
}


export type MeetingTemplate = {
  id: string
  project_id: string
  name: string
  agenda: string | null
  created_by: string | null
  created_at: string
}

export function useMeetingTemplates(projectId: string) {
  return useQuery({
    queryKey: ['meeting-templates', projectId],
    queryFn: () =>
      api<{ items: MeetingTemplate[]; total: number }>(
        `/api/v1/projects/${projectId}/meeting-templates`,
      ),
  })
}

export function useCreateMeetingTemplate(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; agenda?: string; from_meeting_id?: string }) =>
      api<MeetingTemplate>(`/api/v1/projects/${projectId}/meeting-templates`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['meeting-templates', projectId] })
    },
  })
}

export function useDeleteMeetingTemplate(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string) =>
      api(`/api/v1/meeting-templates/${templateId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['meeting-templates', projectId] })
    },
  })
}
