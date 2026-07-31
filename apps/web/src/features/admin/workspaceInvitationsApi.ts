import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

import { api } from '@/lib/api'
import { queryClient } from '@/lib/query'

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export type WorkspaceInvitation = {
  id: string
  email: string
  display_name: string
  status: InvitationStatus
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  version: number
  created_at: string
}

export type WorkspaceInvitationSecret = WorkspaceInvitation & { token: string }
export type WorkspaceInvitationList = { items: WorkspaceInvitation[]; total: number }

export type WorkspaceInvitationRequestState = {
  requestVersion: number
  successfulRequestVersion: number
  dataUpdateCountAtStart: number
}

let requestState: WorkspaceInvitationRequestState = {
  requestVersion: 0,
  successfulRequestVersion: 0,
  dataUpdateCountAtStart: 0,
}
const requestStateListeners = new Set<() => void>()
const workspaceInvitationsQueryKey = ['workspace-invitations'] as const

function publishRequestState(next: WorkspaceInvitationRequestState) {
  requestState = next
  requestStateListeners.forEach((listener) => listener())
}

function startWorkspaceInvitationRequest() {
  const requestVersion = requestState.requestVersion + 1
  publishRequestState({
    requestVersion,
    successfulRequestVersion: requestState.successfulRequestVersion,
    dataUpdateCountAtStart:
      queryClient.getQueryState(workspaceInvitationsQueryKey)?.dataUpdateCount ?? 0,
  })
  return requestVersion
}

function completeWorkspaceInvitationRequest(requestVersion: number) {
  if (requestVersion !== requestState.requestVersion) return
  publishRequestState({
    requestVersion,
    successfulRequestVersion: requestVersion,
    dataUpdateCountAtStart: requestState.dataUpdateCountAtStart,
  })
}

export function getWorkspaceInvitationRequestState() {
  return requestState
}

export function useWorkspaceInvitationRequestState() {
  return useSyncExternalStore(
    (listener) => {
      requestStateListeners.add(listener)
      return () => requestStateListeners.delete(listener)
    },
    getWorkspaceInvitationRequestState,
    getWorkspaceInvitationRequestState,
  )
}

export function isWorkspaceInvitationRequestAccepted() {
  const queryState = queryClient.getQueryState(workspaceInvitationsQueryKey)
  return Boolean(
    queryState &&
      queryState.fetchStatus === 'idle' &&
      requestState.requestVersion === requestState.successfulRequestVersion &&
      queryState.dataUpdateCount > requestState.dataUpdateCountAtStart,
  )
}

export function useWorkspaceInvitations(enabled = true) {
  return useQuery({
    queryKey: workspaceInvitationsQueryKey,
    queryFn: async ({ signal }) => {
      const requestVersion = startWorkspaceInvitationRequest()
      const result = await api<WorkspaceInvitationList>('/api/v1/workspace-invitations', {
        signal,
      })
      completeWorkspaceInvitationRequest(requestVersion)
      return result
    },
    enabled,
    retry: false,
  })
}

export function useCreateWorkspaceInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; display_name: string }) =>
      api<WorkspaceInvitationSecret>('/api/v1/workspace-invitations', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-invitations'] })
    },
  })
}

export function useRotateWorkspaceInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; expected_version: number }) =>
      api<WorkspaceInvitationSecret>(`/api/v1/workspace-invitations/${input.id}/rotate`, {
        method: 'POST',
        body: JSON.stringify({ expected_version: input.expected_version }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-invitations'] })
    },
  })
}

export function useRevokeWorkspaceInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; expected_version: number }) =>
      api<void>(
        `/api/v1/workspace-invitations/${input.id}?expected_version=${input.expected_version}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-invitations'] })
    },
  })
}

export type WorkspaceInvitationPreview = {
  display_name: string
  masked_email: string
  status: InvitationStatus
  expires_at: string
}

export type WorkspaceInvitationAccepted = {
  email: string
  display_name: string
  login_path: string
}

export function previewWorkspaceInvitation(token: string) {
  return api<WorkspaceInvitationPreview>('/api/v1/workspace-invitations/preview', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

export function useAcceptWorkspaceInvitation() {
  return useMutation({
    mutationFn: (token: string) =>
      api<WorkspaceInvitationAccepted>('/api/v1/workspace-invitations/accept', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
  })
}
