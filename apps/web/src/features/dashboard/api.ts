import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type Bucket = { key: string; count: number }

export type Dashboard = {
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
  actor_name: string | null
  action: 'created' | 'field_changed' | 'commented'
  field: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
}

export type ProjectActivityList = {
  items: ProjectActivity[]
  total: number
}

export function useProjectActivities(projectId: string) {
  return useQuery({
    queryKey: ['project-activities', projectId],
    queryFn: () => api<ProjectActivityList>(`/api/v1/projects/${projectId}/activities`),
  })
}
