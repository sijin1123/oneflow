import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { registerIdentityReset } from '@/features/auth/cache'
import { api } from '@/lib/api'
import { queryClient as appQueryClient } from '@/lib/query'

type CustomFieldRequestState = {
  requestVersion: number
  successfulRequestVersion: number
  dataUpdateCountAtStart: number
}

const customFieldRequestStates = new Map<string, CustomFieldRequestState>()
const emptyCustomFieldRequestState: CustomFieldRequestState = {
  requestVersion: 0,
  successfulRequestVersion: 0,
  dataUpdateCountAtStart: 0,
}

function customFieldsQueryKey(projectId: string, includeInactive = false) {
  return ['custom-fields', projectId, { includeInactive }] as const
}

function customFieldRequestKey(projectId: string, includeInactive: boolean) {
  return `${projectId}:${includeInactive ? 'all' : 'active'}`
}

export function getCustomFieldRequestState(
  projectId: string,
  includeInactive = false,
) {
  return (
    customFieldRequestStates.get(customFieldRequestKey(projectId, includeInactive)) ??
    emptyCustomFieldRequestState
  )
}

function startCustomFieldRequest(projectId: string, includeInactive: boolean) {
  const previous = getCustomFieldRequestState(projectId, includeInactive)
  const requestVersion = previous.requestVersion + 1
  customFieldRequestStates.set(customFieldRequestKey(projectId, includeInactive), {
    requestVersion,
    successfulRequestVersion: previous.successfulRequestVersion,
    dataUpdateCountAtStart:
      appQueryClient.getQueryState(customFieldsQueryKey(projectId, includeInactive))
        ?.dataUpdateCount ?? 0,
  })
  return requestVersion
}

function completeCustomFieldRequest(
  projectId: string,
  includeInactive: boolean,
  requestVersion: number,
) {
  const current = getCustomFieldRequestState(projectId, includeInactive)
  if (current.requestVersion !== requestVersion) return
  customFieldRequestStates.set(customFieldRequestKey(projectId, includeInactive), {
    ...current,
    successfulRequestVersion: requestVersion,
  })
}

export function isCustomFieldRequestAccepted(
  projectId: string,
  includeInactive = false,
) {
  const request = getCustomFieldRequestState(projectId, includeInactive)
  const query = appQueryClient.getQueryState(
    customFieldsQueryKey(projectId, includeInactive),
  )
  return Boolean(
    query &&
      query.fetchStatus === 'idle' &&
      request.requestVersion === request.successfulRequestVersion &&
      query.dataUpdateCount > request.dataUpdateCountAtStart,
  )
}

registerIdentityReset(() => customFieldRequestStates.clear())

export type CustomFieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'dropdown'
  | 'member'
  | 'url'

export type CustomField = {
  id: string
  project_id: string
  name: string
  field_type: CustomFieldType
  options: string[] | null
  position: number
  is_active: boolean
  applies_to: string[] | null
  created_at: string
  updated_at: string
}

export type CustomFieldList = { items: CustomField[]; total: number }

export type CustomValue = {
  field_id: string
  value: unknown
  member_display_name: string | null
}

export type CustomValueList = { items: CustomValue[]; total: number }

export const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: '텍스트',
  number: '숫자',
  boolean: '예/아니오',
  date: '날짜',
  dropdown: '드롭다운',
  member: '멤버',
  url: 'URL',
}

export function useCustomFields(projectId: string, includeInactive = false) {
  return useQuery({
    queryKey: customFieldsQueryKey(projectId, includeInactive),
    queryFn: async () => {
      const requestVersion = startCustomFieldRequest(projectId, includeInactive)
      const result = await api<CustomFieldList>(
        `/api/v1/projects/${projectId}/custom-fields${includeInactive ? '?include_inactive=true' : ''}`,
      )
      completeCustomFieldRequest(projectId, includeInactive, requestVersion)
      return result
    },
  })
}

export function useCreateCustomField(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      name: string
      field_type: CustomFieldType
      options?: string[]
      applies_to?: string[] | null
    }) =>
      api<CustomField>(`/api/v1/projects/${projectId}/custom-fields`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['custom-fields', projectId] })
    },
  })
}

export function useUpdateCustomField(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      fieldId,
      ...input
    }: {
      fieldId: string
      name?: string
      options?: string[]
      is_active?: boolean
      applies_to?: string[] | null
    }) =>
      api<CustomField>(`/api/v1/projects/${projectId}/custom-fields/${fieldId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['custom-fields', projectId] })
    },
  })
}

export function useDeleteCustomField(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fieldId: string) =>
      api<void>(`/api/v1/projects/${projectId}/custom-fields/${fieldId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['custom-fields', projectId] })
    },
  })
}

export function useCustomValues(wpId: string | null) {
  return useQuery({
    queryKey: ['custom-values', wpId],
    queryFn: () => api<CustomValueList>(`/api/v1/work-packages/${wpId}/custom-values`),
    enabled: wpId !== null,
  })
}

export function usePutCustomValue(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    // Delta semantics: exactly one field per save from the drawer.
    mutationFn: (input: { field_id: string; value: unknown }) =>
      api<CustomValueList>(`/api/v1/work-packages/${wpId}/custom-values`, {
        method: 'PUT',
        body: JSON.stringify({ values: [input] }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['custom-values', wpId], data)
    },
  })
}


export function useReorderCustomFields(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      api<CustomFieldList>(`/api/v1/projects/${projectId}/custom-fields/order`, {
        method: 'PUT',
        body: JSON.stringify({ ordered_ids: orderedIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['custom-fields', projectId] })
    },
  })
}
