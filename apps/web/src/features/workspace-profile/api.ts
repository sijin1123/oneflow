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

export type ProjectPhaseKey = 'discover' | 'plan' | 'deliver' | 'close'
export type ProjectPhaseColor = 'sky' | 'indigo' | 'emerald' | 'amber'

export type WorkspaceProjectPhaseDefinition = {
  key: ProjectPhaseKey
  name: string
  color: ProjectPhaseColor
  position: number
}

export type WorkspaceProjectPhaseDefinitions = {
  items: WorkspaceProjectPhaseDefinition[]
  revision: number
  updated_by_user_id: string | null
  updated_by_name: string | null
  updated_at: string
}

export const workspaceProfileKey = ['workspace-profile'] as const
export const adminWorkspaceProfileKey = ['admin-workspace-profile'] as const
export const workspaceCalendarKey = ['workspace-calendar'] as const
export const workspaceProjectPhaseDefinitionsKey = ['workspace-project-phase-definitions'] as const

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

export function useWorkspaceProjectPhaseDefinitions() {
  return useQuery({
    queryKey: workspaceProjectPhaseDefinitionsKey,
    queryFn: () =>
      api<WorkspaceProjectPhaseDefinitions>('/api/v1/workspace/project-phase-definitions'),
  })
}

export function useUpdateWorkspaceProjectPhaseDefinitions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      items,
      revision,
    }: {
      items: Array<Omit<WorkspaceProjectPhaseDefinition, 'position'>>
      revision: number
    }) =>
      api<WorkspaceProjectPhaseDefinitions>(
        '/api/v1/admin/workspace/project-phase-definitions',
        {
          method: 'PATCH',
          headers: { 'If-Match': `"${revision}"` },
          body: JSON.stringify({ items }),
        },
      ),
    onSuccess: async (definitions) => {
      queryClient.setQueryData(workspaceProjectPhaseDefinitionsKey, definitions)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminWorkspaceProfileKey }),
        queryClient.invalidateQueries({ queryKey: workspaceProfileKey }),
        queryClient.invalidateQueries({ queryKey: workspaceCalendarKey }),
        queryClient.invalidateQueries({ queryKey: ['project-phases'] }),
      ])
    },
    onError: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspaceProjectPhaseDefinitionsKey }),
        queryClient.invalidateQueries({ queryKey: adminWorkspaceProfileKey }),
        queryClient.invalidateQueries({ queryKey: workspaceProfileKey }),
        queryClient.invalidateQueries({ queryKey: workspaceCalendarKey }),
      ])
    },
  })
}
