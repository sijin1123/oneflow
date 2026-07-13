import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { api } from '@/lib/api'

import type { Me, Member, MemberList, PermissionReport } from './types'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/v1/me'),
    staleTime: Infinity, // dev user does not change within a session
  })
}

export function useMembers(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['members', projectId],
    queryFn: () => api<MemberList>(`/api/v1/projects/${projectId}/members`),
    enabled,
  })
}

/** Resolve an assignee user id to a display name (falls back to a short id).
 *  Lets the list/drawer render "누구에게" without each caller re-deriving the map. */
export function useMemberNames(projectId: string): (userId: string | null) => string {
  const { data } = useMembers(projectId)
  const map = useMemo(() => {
    const m: Record<string, string> = {}
    for (const mem of data?.items ?? []) m[mem.user_id] = mem.display_name
    return m
  }, [data])
  return (userId: string | null) => (userId ? (map[userId] ?? '알 수 없음') : '미배정')
}

export function usePermissionReport(projectId: string) {
  return useQuery({
    queryKey: ['permissions', projectId],
    queryFn: () => api<PermissionReport>(`/api/v1/projects/${projectId}/permissions`),
    staleTime: Infinity, // fixed matrix — changes only with a deploy
  })
}

export function useAddMember(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; role: string }) =>
      api<Member>(`/api/v1/projects/${projectId}/members`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['members', projectId] })
    },
  })
}

export function useUpdateMemberRole(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api<Member>(`/api/v1/projects/${projectId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['members', projectId] })
    },
  })
}

export function useRemoveMember(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      api<void>(`/api/v1/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['members', projectId] })
    },
  })
}
