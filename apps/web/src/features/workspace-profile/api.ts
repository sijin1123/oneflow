import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type WorkspaceIdentity = {
  name: string
  revision: number
}

export type WorkspaceProfile = WorkspaceIdentity & {
  id: number
  updated_by_user_id: string | null
  updated_by_name: string | null
  updated_at: string
}

export type WorkspaceCalendar = {
  working_weekdays: number[]
  holidays: string[]
  revision: number
  updated_by_user_id: string | null
  updated_by_name: string | null
  updated_at: string
}

export const workspaceProfileKey = ['workspace-profile'] as const
export const adminWorkspaceProfileKey = ['admin-workspace-profile'] as const
export const workspaceCalendarKey = ['workspace-calendar'] as const

export function useWorkspaceProfile() {
  return useQuery({
    queryKey: workspaceProfileKey,
    queryFn: () => api<WorkspaceIdentity>('/api/v1/workspace/profile'),
    staleTime: 10_000,
  })
}

export function useAdminWorkspaceProfile() {
  return useQuery({
    queryKey: adminWorkspaceProfileKey,
    queryFn: () => api<WorkspaceProfile>('/api/v1/admin/workspace/profile'),
  })
}

export function useUpdateWorkspaceProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: adminWorkspaceProfileKey }),
        queryClient.cancelQueries({ queryKey: workspaceProfileKey }),
      ])
    },
    mutationFn: ({ name, revision }: { name: string; revision: number }) =>
      api<WorkspaceProfile>('/api/v1/admin/workspace/profile', {
        method: 'PATCH',
        headers: { 'If-Match': `"${revision}"` },
        body: JSON.stringify({ name }),
      }),
    onSuccess: (profile) => {
      queryClient.setQueryData(adminWorkspaceProfileKey, profile)
      queryClient.setQueryData<WorkspaceIdentity>(workspaceProfileKey, {
        name: profile.name,
        revision: profile.revision,
      })
    },
    onError: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminWorkspaceProfileKey }),
        queryClient.invalidateQueries({ queryKey: workspaceProfileKey }),
      ])
    },
  })
}

export function useWorkspaceCalendar() {
  return useQuery({
    queryKey: workspaceCalendarKey,
    queryFn: () => api<WorkspaceCalendar>('/api/v1/workspace/calendar'),
  })
}

export function useUpdateWorkspaceCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      workingWeekdays,
      holidays,
      revision,
    }: {
      workingWeekdays: number[]
      holidays: string[]
      revision: number
    }) =>
      api<WorkspaceCalendar>('/api/v1/admin/workspace/calendar', {
        method: 'PATCH',
        headers: { 'If-Match': `"${revision}"` },
        body: JSON.stringify({ working_weekdays: workingWeekdays, holidays }),
      }),
    onSuccess: async (calendar) => {
      queryClient.setQueryData(workspaceCalendarKey, calendar)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminWorkspaceProfileKey }),
        queryClient.invalidateQueries({ queryKey: workspaceProfileKey }),
      ])
    },
    onError: () => queryClient.invalidateQueries({ queryKey: workspaceCalendarKey }),
  })
}
