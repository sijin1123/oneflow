import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { registerIdentityReset } from '@/features/auth/cache'
import { ApiError, BASE_URL, api } from '@/lib/api'
import { queryClient as appQueryClient } from '@/lib/query'

import type {
  Me,
  Member,
  MemberCreate,
  MemberList,
  MemberRoleUpdate,
  PermissionReport,
} from './types'

type MemberRequestState = {
  requestVersion: number
  successfulRequestVersion: number
  dataUpdateCountAtStart: number
}

const memberRequestStates = new Map<string, MemberRequestState>()
const permissionRequestStates = new Map<string, MemberRequestState>()
const emptyMemberRequestState: MemberRequestState = {
  requestVersion: 0,
  successfulRequestVersion: 0,
  dataUpdateCountAtStart: 0,
}

function memberQueryKey(projectId: string) {
  return ['members', projectId] as const
}

function permissionQueryKey(projectId: string) {
  return ['permissions', projectId] as const
}

export function getMemberRequestState(projectId: string) {
  return memberRequestStates.get(projectId) ?? emptyMemberRequestState
}

function startMemberRequest(projectId: string) {
  const previous = getMemberRequestState(projectId)
  const requestVersion = previous.requestVersion + 1
  memberRequestStates.set(projectId, {
    requestVersion,
    successfulRequestVersion: previous.successfulRequestVersion,
    dataUpdateCountAtStart:
      appQueryClient.getQueryState(memberQueryKey(projectId))?.dataUpdateCount ?? 0,
  })
  return requestVersion
}

function completeMemberRequest(projectId: string, requestVersion: number) {
  const current = getMemberRequestState(projectId)
  if (current.requestVersion !== requestVersion) return
  memberRequestStates.set(projectId, {
    ...current,
    successfulRequestVersion: requestVersion,
  })
}

export function isMemberRequestAccepted(projectId: string) {
  const request = getMemberRequestState(projectId)
  const query = appQueryClient.getQueryState(memberQueryKey(projectId))
  return Boolean(
    query &&
      query.fetchStatus === 'idle' &&
      request.requestVersion === request.successfulRequestVersion &&
      query.dataUpdateCount > request.dataUpdateCountAtStart,
  )
}

export function getPermissionRequestState(projectId: string) {
  return permissionRequestStates.get(projectId) ?? emptyMemberRequestState
}

function startPermissionRequest(projectId: string) {
  const previous = getPermissionRequestState(projectId)
  const requestVersion = previous.requestVersion + 1
  permissionRequestStates.set(projectId, {
    requestVersion,
    successfulRequestVersion: previous.successfulRequestVersion,
    dataUpdateCountAtStart:
      appQueryClient.getQueryState(permissionQueryKey(projectId))?.dataUpdateCount ?? 0,
  })
  return requestVersion
}

function completePermissionRequest(projectId: string, requestVersion: number) {
  const current = getPermissionRequestState(projectId)
  if (current.requestVersion !== requestVersion) return
  permissionRequestStates.set(projectId, {
    ...current,
    successfulRequestVersion: requestVersion,
  })
}

export function isPermissionRequestAccepted(projectId: string) {
  const request = getPermissionRequestState(projectId)
  const query = appQueryClient.getQueryState(permissionQueryKey(projectId))
  return Boolean(
    query &&
      query.fetchStatus === 'idle' &&
      request.requestVersion === request.successfulRequestVersion &&
      query.dataUpdateCount > request.dataUpdateCountAtStart,
  )
}

registerIdentityReset(() => {
  memberRequestStates.clear()
  permissionRequestStates.clear()
})

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/v1/me'),
    staleTime: Infinity, // dev user does not change within a session
  })
}

export function useUpdateMyProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ displayName, revision }: { displayName: string; revision: number }) =>
      api<Me>('/api/v1/me/profile', {
        method: 'PATCH',
        headers: { 'If-Match': `"${revision}"` },
        body: JSON.stringify({ display_name: displayName }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['me'], updated)
      void queryClient.invalidateQueries({ queryKey: ['members'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      void queryClient.invalidateQueries({ queryKey: ['wp-watchers'] })
      void queryClient.invalidateQueries({ queryKey: ['module-members'] })
      void queryClient.invalidateQueries({ queryKey: ['initiative-owner-candidates'] })
      void queryClient.invalidateQueries({ queryKey: ['initiatives'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-worklog-options'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-worklogs'] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 412) {
        void queryClient.invalidateQueries({ queryKey: ['me'] })
      }
    },
  })
}

export function profileImageSrc(
  profile: {
    profile_image_url?: string | null
    actor_profile_image_url?: string | null
    author_profile_image_url?: string | null
    changed_by_profile_image_url?: string | null
    decided_by_profile_image_url?: string | null
  } | undefined,
): string | null {
  const path = profile?.profile_image_url
    ?? profile?.actor_profile_image_url
    ?? profile?.author_profile_image_url
    ?? profile?.changed_by_profile_image_url
    ?? profile?.decided_by_profile_image_url
  return path ? `${BASE_URL}${path}` : null
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
    onSuccess: (updated) => {
      queryClient.setQueryData(['me'], updated)
      void queryClient.invalidateQueries({ queryKey: ['members'] })
      void queryClient.invalidateQueries({ queryKey: ['wp-watchers'] })
    },
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
    onSuccess: (updated) => {
      queryClient.setQueryData(['me'], updated)
      void queryClient.invalidateQueries({ queryKey: ['members'] })
      void queryClient.invalidateQueries({ queryKey: ['wp-watchers'] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 412) {
        void queryClient.invalidateQueries({ queryKey: ['me'] })
      }
    },
  })
}

export function useMembers(projectId: string, enabled = true) {
  return useQuery({
    queryKey: memberQueryKey(projectId),
    queryFn: async () => {
      const requestVersion = startMemberRequest(projectId)
      const members = await api<MemberList>(`/api/v1/projects/${projectId}/members`)
      completeMemberRequest(projectId, requestVersion)
      return members
    },
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

export function usePermissionReport(projectId: string, enabled = true) {
  return useQuery({
    queryKey: permissionQueryKey(projectId),
    queryFn: async () => {
      const requestVersion = startPermissionRequest(projectId)
      const result = await api<PermissionReport>(
        `/api/v1/projects/${projectId}/permissions`,
      )
      completePermissionRequest(projectId, requestVersion)
      return result
    },
    enabled,
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
