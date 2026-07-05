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
}

export function useDashboard(projectId: string) {
  return useQuery({
    queryKey: ['dashboard', projectId],
    queryFn: () => api<Dashboard>(`/api/v1/projects/${projectId}/dashboard`),
  })
}
