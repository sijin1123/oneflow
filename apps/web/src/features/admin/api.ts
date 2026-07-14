import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type DirectoryUser = {
  id: string
  email: string
  display_name: string
  is_active: boolean
  is_admin: boolean
  created_at: string
}

export type DirectoryList = { items: DirectoryUser[]; total: number }

export type UserMembership = {
  project_id: string
  project_key: string
  project_name: string
  role: 'owner' | 'member' | 'viewer'
  archived: boolean
}

export type UserMembershipList = { items: UserMembership[]; total: number }

export function useUsers(enabled = true) {
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api<DirectoryList>('/api/v1/users'),
    enabled,
  })
}

export function useUserMemberships(userId: string | null) {
  return useQuery({
    queryKey: ['admin-user-memberships', userId],
    queryFn: () => api<UserMembershipList>(`/api/v1/users/${userId}/memberships`),
    enabled: userId !== null,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; display_name: string }) =>
      api<DirectoryUser>('/api/v1/users', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string
      display_name?: string
      is_active?: boolean
      is_admin?: boolean
    }) => api<DirectoryUser>(`/api/v1/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })
}
