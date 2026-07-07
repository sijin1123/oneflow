import { useQuery } from '@tanstack/react-query'

import type { WorkPackage } from '@/features/work-packages/types'
import { api } from '@/lib/api'

export type MyWorkPackage = {
  id: string
  project_id: string
  project_name: string
  subject: string
  type: WorkPackage['type']
  status: WorkPackage['status']
  priority: WorkPackage['priority']
  due_date: string | null
  assignee_id: string | null
  assignee_name: string | null
}

export type MyActivity = {
  id: string
  project_id: string
  project_name: string
  work_package_id: string
  work_package_subject: string
  actor_name: string | null
  action: string
  field: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
}

export type MeWork = {
  assigned_to_me: MyWorkPackage[]
  created_by_me: MyWorkPackage[]
  due_soon: MyWorkPackage[]
  recent_activity: MyActivity[]
}

export function useMyWork() {
  return useQuery({
    queryKey: ['me-work'],
    queryFn: () => api<MeWork>('/api/v1/me/work'),
  })
}
