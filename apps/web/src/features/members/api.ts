import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { ApiError, BASE_URL, api } from '@/lib/api'

import type {
  Me,
  Member,
  MemberCreate,
  MemberList,
  MemberRoleUpdate,
  PermissionReport,
} from './types'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/v1/me'),
    staleTime: Infinity, // dev user does not change within a session
  })
}

export function profileImageSrc(me: Me | undefined): string | null {
  return me?.profile_image_url ? `${BASE_URL}${me.profile_image_url}` : null
}

export function useReplaceProfileImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file, revision }: { file: File; revision: number }) =>
      api<Me>('/api/v1/me/profile-image', {
        method: 'PUT',
        headers: {
          'content-type': file.type,
          'If-Match': `"${revision}"`,
          'X-File-Name': encodeURIComponent(file.name),
        },
        body: file,
      }),
    onSuccess: (updated) => queryClient.setQueryData(['me'], updated),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 412) {
        void queryClient.invalidateQueries({ queryKey: ['me'] })
      }
    },
  })
}

export function useRemoveProfileImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (revision: number) =>
      api<Me>('/api/v1/me/profile-image', {
        method: 'DELETE',
        headers: { 'If-Match': `"${revision}"` },
      }),
    onSuccess: (updated) => queryClient.setQueryData(['me'], updated),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 412) {
        void queryClient.invalidateQueries({ queryKey: ['me'] })
      }
    },
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
    mutationFn: (input: MemberCreate) =>
      api<Member>(`/api/v1/projects/${projectId}/members`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['members', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['permissions', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['admin-project-roles'] })
    },
  })
}

export function useUpdateMemberRole(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: MemberRoleUpdate }) =>
      api<Member>(`/api/v1/projects/${projectId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['members', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['permissions', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['admin-project-roles'] })
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
      void queryClient.invalidateQueries({ queryKey: ['permissions', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['admin-project-roles'] })
    },
  })
}
