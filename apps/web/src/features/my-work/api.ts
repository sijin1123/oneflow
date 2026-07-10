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

export type MyWorkItem = MyWorkPackage & {
  updated_at: string
}

export type MyWorkItemRelationship = 'assigned' | 'created' | 'subscribed'
export type MyWorkItemState = 'open' | 'all'
export type MyWorkItemSort = 'updated' | 'due'

export type MyWorkItemList = {
  items: MyWorkItem[]
  total: number
  limit: number
  offset: number
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

export type MyActivityList = {
  items: MyActivity[]
  total: number
  limit: number
  offset: number
}

export function useMyWork() {
  return useQuery({
    queryKey: ['me-work'],
    queryFn: () => api<MeWork>('/api/v1/me/work'),
  })
}

export function useMyWorkItems({
  relationship,
  state,
  sort,
  q,
  limit = 50,
  offset = 0,
  enabled = true,
}: {
  relationship: MyWorkItemRelationship
  state: MyWorkItemState
  sort: MyWorkItemSort
  q: string
  limit?: number
  offset?: number
  enabled?: boolean
}) {
  return useQuery({
    queryKey: ['me-work-items', relationship, state, sort, q, limit, offset],
    queryFn: () => {
      const params = new URLSearchParams({
        relationship,
        state,
        sort,
        limit: String(limit),
        offset: String(offset),
      })
      if (q) params.set('q', q)
      return api<MyWorkItemList>(`/api/v1/me/work-items?${params.toString()}`)
    },
    enabled,
  })
}

export function useMyActivities({
  q,
  limit = 50,
  offset = 0,
  enabled = true,
}: {
  q: string
  limit?: number
  offset?: number
  enabled?: boolean
}) {
  return useQuery({
    queryKey: ['me-activities', q, limit, offset],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      })
      if (q) params.set('q', q)
      return api<MyActivityList>(`/api/v1/me/activities?${params.toString()}`)
    },
    enabled,
  })
}


export type MyTimeEntry = {
  id: string
  work_package_id: string
  work_package_subject: string
  project_id: string
  project_name: string
  hours: number
  note: string | null
  spent_on: string
}

export type MyTime = {
  from_date: string
  to_date: string
  items: MyTimeEntry[]
  total: number
  total_hours: number
  by_project: Array<{ project_id: string; project_name: string; hours: number }>
}

export function useMyTime() {
  return useQuery({
    queryKey: ['my-time'],
    queryFn: () => api<MyTime>('/api/v1/me/time-entries'),
  })
}
