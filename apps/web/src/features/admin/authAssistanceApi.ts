import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

import { api } from '@/lib/api'
import { queryClient } from '@/lib/query'

export type AuthAssistanceKind = 'sign_in_help' | 'workspace_access'
export type AuthAssistanceStatus = 'pending' | 'in_review' | 'resolved' | 'rejected'

export type AuthAssistanceRequest = {
  id: string
  kind: AuthAssistanceKind
  status: AuthAssistanceStatus
  email: string | null
  reason: string | null
  submission_count: number
  last_submitted_at: string
  version: number
  triage_note: string | null
  triaged_by_id: string | null
  triaged_at: string | null
  redacted_at: string | null
  created_at: string
  updated_at: string
}

export type AuthAssistanceList = {
  items: AuthAssistanceRequest[]
  total: number
  limit: number
  offset: number
}

export type AuthAssistanceFilters = {
  status: AuthAssistanceStatus | ''
  kind: AuthAssistanceKind | ''
  offset: number
}

export function authAssistanceParams(filters: AuthAssistanceFilters) {
  const params = new URLSearchParams({ limit: '50', offset: String(filters.offset) })
  if (filters.status) params.set('status', filters.status)
  if (filters.kind) params.set('kind', filters.kind)
  return params
}

const queryKey = ['admin-auth-assistance'] as const

type AuthAssistanceRequestState = {
  requestVersion: number
  successfulRequestVersion: number
  requestIdentity: string
  dataUpdateCountAtStart: number
}

const emptyRequestState: AuthAssistanceRequestState = {
  requestVersion: 0,
  successfulRequestVersion: 0,
  requestIdentity: '',
  dataUpdateCountAtStart: 0,
}
const requestStates = new Map<string, AuthAssistanceRequestState>()
const requestStateListeners = new Set<() => void>()

function authAssistanceQueryKey(filters: AuthAssistanceFilters) {
  return [...queryKey, filters] as const
}

function authAssistanceRequestIdentity(filters: AuthAssistanceFilters) {
  return `${filters.status}\u0000${filters.kind}\u0000${filters.offset}`
}

function requestStateForIdentity(identity: string) {
  return requestStates.get(identity) ?? emptyRequestState
}

function publishRequestState(identity: string, next: AuthAssistanceRequestState) {
  requestStates.set(identity, next)
  requestStateListeners.forEach((listener) => listener())
}

function startAuthAssistanceRequest(filters: AuthAssistanceFilters) {
  const requestIdentity = authAssistanceRequestIdentity(filters)
  const previous = requestStateForIdentity(requestIdentity)
  const requestVersion = previous.requestVersion + 1
  const exactQueryKey = authAssistanceQueryKey(filters)
  publishRequestState(requestIdentity, {
    requestVersion,
    successfulRequestVersion: previous.successfulRequestVersion,
    requestIdentity,
    dataUpdateCountAtStart: queryClient.getQueryState(exactQueryKey)?.dataUpdateCount ?? 0,
  })
  return requestVersion
}

function completeAuthAssistanceRequest(filters: AuthAssistanceFilters, requestVersion: number) {
  const requestIdentity = authAssistanceRequestIdentity(filters)
  const current = requestStateForIdentity(requestIdentity)
  if (requestVersion !== current.requestVersion) return
  publishRequestState(requestIdentity, {
    ...current,
    successfulRequestVersion: requestVersion,
  })
}

export function getAdminAuthAssistanceRequestState(filters: AuthAssistanceFilters) {
  return requestStateForIdentity(authAssistanceRequestIdentity(filters))
}

export function useAdminAuthAssistanceRequestState(filters: AuthAssistanceFilters) {
  const requestIdentity = authAssistanceRequestIdentity(filters)
  return useSyncExternalStore(
    (listener) => {
      requestStateListeners.add(listener)
      return () => requestStateListeners.delete(listener)
    },
    () => requestStateForIdentity(requestIdentity),
    () => requestStateForIdentity(requestIdentity),
  )
}

export function isAdminAuthAssistanceRequestAccepted(filters: AuthAssistanceFilters) {
  const current = getAdminAuthAssistanceRequestState(filters)
  const exactQueryState = queryClient.getQueryState(authAssistanceQueryKey(filters))
  return Boolean(
    exactQueryState &&
      exactQueryState.fetchStatus === 'idle' &&
      current.requestIdentity === authAssistanceRequestIdentity(filters) &&
      current.requestVersion === current.successfulRequestVersion &&
      exactQueryState.dataUpdateCount > current.dataUpdateCountAtStart,
  )
}

export function useAdminAuthAssistance(filters: AuthAssistanceFilters, enabled = true) {
  return useQuery({
    queryKey: authAssistanceQueryKey(filters),
    queryFn: async ({ signal }) => {
      const requestVersion = startAuthAssistanceRequest(filters)
      const result = await api<AuthAssistanceList>(
        `/api/v1/admin/auth-assistance-requests?${authAssistanceParams(filters)}`,
        { signal },
      )
      completeAuthAssistanceRequest(filters, requestVersion)
      return result
    },
    enabled,
    staleTime: 0,
    gcTime: 0,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export function useTriageAuthAssistance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      status,
      expectedVersion,
      note,
    }: {
      id: string
      status: Exclude<AuthAssistanceStatus, 'pending'>
      expectedVersion: number
      note?: string
    }) =>
      api<AuthAssistanceRequest>(`/api/v1/admin/auth-assistance-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          expected_version: expectedVersion,
          note,
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
}

export function useRedactAuthAssistance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/v1/admin/auth-assistance-requests/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
}
