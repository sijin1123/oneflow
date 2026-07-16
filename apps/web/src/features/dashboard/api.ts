import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import type { WorkPackage } from '@/features/work-packages/types'

export type Bucket = { key: string; count: number }

export type Dashboard = {
  id: string
  key: string
  name: string
  description: string | null
  health: 'on_track' | 'at_risk' | 'off_track' | null
  health_note: string | null
  archived_at: string | null
  completion_percent: number
  recent_work_packages: Array<{
    id: string
    subject: string
    status: WorkPackage['status']
    priority: WorkPackage['priority']
    assignee_name: string | null
    updated_at: string
  }>
  total_work_packages: number
  open_work_packages: number
  overdue_count: number
  status_counts: Bucket[]
  priority_counts: Bucket[]
  type_counts: Bucket[]
  total_estimated_hours: number
  total_spent_hours: number
  budget: number | null
  total_cost: number
}

export function useDashboard(projectId: string) {
  return useQuery({
    queryKey: ['dashboard', projectId],
    queryFn: () => api<Dashboard>(`/api/v1/projects/${projectId}/dashboard`),
  })
}

export type ProjectActivity = {
  id: string
  work_package_id: string
  work_package_subject: string
  actor_id: string | null
  actor_name: string | null
  action: 'created' | 'field_changed' | 'commented'
  field: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
}

export type ProjectActivityList = {
  items: ProjectActivity[]
  /** RETURNED count (legacy contract) — `truncated` says more rows exist */
  total: number
  truncated: boolean
}

export type ActivityFilters = { action?: string; order?: 'asc' | 'desc'; actor_id?: string }

export function useProjectActivities(projectId: string, filters: ActivityFilters = {}) {
  const params = new URLSearchParams()
  if (filters.action) params.set('action', filters.action)
  if (filters.order) params.set('order', filters.order)
  if (filters.actor_id) params.set('actor_id', filters.actor_id)
  const qs = params.toString()
  return useQuery({
    // filters belong in the cache key — each combination is its own page
    queryKey: [
      'project-activities',
      projectId,
      filters.action ?? '',
      filters.order ?? 'desc',
      filters.actor_id ?? '',
    ],
    queryFn: () =>
      api<ProjectActivityList>(`/api/v1/projects/${projectId}/activities${qs ? `?${qs}` : ''}`),
  })
}

export type DashboardLayout = {
  widgets: string[]
  updated_at: string | null
  is_default: boolean
  source: 'personal' | 'shared' | 'builtin'
  shared_layout: {
    widgets: string[]
    version: number
    updated_at: string
    updated_by_name: string
  } | null
  can_manage_shared: boolean
}

export function useDashboardLayout(projectId: string) {
  return useQuery({
    queryKey: ['dashboard-layout', projectId],
    queryFn: () => api<DashboardLayout>(`/api/v1/projects/${projectId}/dashboard/layout`),
  })
}

export function useSaveDashboardLayout(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (widgets: string[]) =>
      api<DashboardLayout>(`/api/v1/projects/${projectId}/dashboard/layout`, {
        method: 'PUT',
        body: JSON.stringify({ widgets }),
      }),
    onSuccess: (layout) => {
      queryClient.setQueryData(['dashboard-layout', projectId], layout)
    },
  })
}

export function useResetDashboardLayout(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<DashboardLayout>(`/api/v1/projects/${projectId}/dashboard/layout`, {
        method: 'DELETE',
      }),
    onSuccess: (layout) => {
      queryClient.setQueryData(['dashboard-layout', projectId], layout)
    },
  })
}

export function useSaveSharedDashboardLayout(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      widgets,
      expectedVersion,
    }: {
      widgets: string[]
      expectedVersion: number
    }) =>
      api<DashboardLayout>(`/api/v1/projects/${projectId}/dashboard/shared-layout`, {
        method: 'PUT',
        body: JSON.stringify({ widgets, expected_version: expectedVersion }),
      }),
    onSuccess: (layout) => {
      queryClient.setQueryData(['dashboard-layout', projectId], layout)
    },
  })
}

export function useDeleteSharedDashboardLayout(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (expectedVersion: number) =>
      api<DashboardLayout>(
        `/api/v1/projects/${projectId}/dashboard/shared-layout?expected_version=${expectedVersion}`,
        { method: 'DELETE' },
      ),
    onSuccess: (layout) => {
      queryClient.setQueryData(['dashboard-layout', projectId], layout)
    },
  })
}
