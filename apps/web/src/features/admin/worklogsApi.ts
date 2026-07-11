import { useQuery } from '@tanstack/react-query'

import { api, ApiError, BASE_URL, detailFromPayload } from '@/lib/api'

export type WorklogFilters = {
  from: string
  to: string
  userId: string
  projectId: string
  offset: number
}

export type AdminWorklog = {
  id: string
  work_package_id: string
  work_package_subject: string
  project_id: string
  project_key: string
  project_name: string
  project_is_archived: boolean
  user_id: string | null
  user_display_name: string | null
  user_email: string | null
  user_is_active: boolean | null
  hours: number
  spent_on: string
  comment: string | null
  created_at: string
}

export type AdminWorklogList = {
  from_date: string
  to_date: string
  items: AdminWorklog[]
  total: number
  total_hours: number
  limit: number
  offset: number
}

export type AdminWorklogOptions = {
  users: Array<{ id: string; display_name: string; email: string; is_active: boolean }>
  projects: Array<{ id: string; key: string; name: string; is_archived: boolean }>
}

export function worklogParams(filters: WorklogFilters, includeOffset = true) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to })
  if (filters.userId) params.set('user_id', filters.userId)
  if (filters.projectId) params.set('project_id', filters.projectId)
  if (includeOffset) {
    params.set('limit', '50')
    params.set('offset', String(filters.offset))
  }
  return params
}

export function useAdminWorklogs(filters: WorklogFilters, enabled = true) {
  return useQuery({
    queryKey: ['admin-worklogs', filters],
    queryFn: () =>
      api<AdminWorklogList>(`/api/v1/admin/worklogs?${worklogParams(filters)}`),
    enabled,
  })
}

export function useAdminWorklogOptions() {
  return useQuery({
    queryKey: ['admin-worklog-options'],
    queryFn: () => api<AdminWorklogOptions>('/api/v1/admin/worklogs/options'),
  })
}

export async function downloadAdminWorklogs(filters: WorklogFilters) {
  const response = await fetch(
    `${BASE_URL}/api/v1/admin/worklogs/export.csv?${worklogParams(filters, false)}`,
    { credentials: 'include' },
  )
  if (!response.ok) {
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      // Keep the HTTP fallback for non-JSON responses.
    }
    throw new ApiError(
      response.status,
      detailFromPayload(payload) ?? `HTTP ${response.status}`,
      response.headers.get('x-request-id'),
      payload,
    )
  }
  const disposition = response.headers.get('content-disposition') ?? ''
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'oneflow-worklogs.csv'
  return { blob: await response.blob(), filename }
}
