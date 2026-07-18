import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type InitiativeState = 'planned' | 'in_progress' | 'paused' | 'completed' | 'cancelled'

export type InitiativeProject = {
  project_id: string
  project_name: string
  work_package_count: number
  done_work_package_count: number
}

export type InitiativeLabel = {
  id: string
  name: string
  color: string
  created_at: string
  updated_at: string
}

export type InitiativeLabelList = { items: InitiativeLabel[]; total: number }

export type Initiative = {
  id: string
  name: string
  description: string | null
  owner_id: string | null
  owner_name: string | null
  owner_active: boolean
  state: InitiativeState
  start_date: string | null
  target_date: string | null
  health: 'on_track' | 'at_risk' | 'off_track' | null
  health_note: string | null
  health_updated_by: string | null
  health_updated_at: string | null
  is_mine: boolean
  can_claim_ownership: boolean
  connected_project_count: number
  connected_work_item_count: number
  follower_count: number
  is_following: boolean
  labels: InitiativeLabel[]
  projects: InitiativeProject[]
  created_at: string
  updated_at: string
}

export type InitiativeList = { items: Initiative[]; total: number }

export type InitiativeActivityKind =
  | 'initiative_created'
  | 'properties_updated'
  | 'lifecycle_updated'
  | 'health_updated'
  | 'owner_transferred'
  | 'owner_claimed'
  | 'labels_updated'
  | 'project_connected'
  | 'project_disconnected'
  | 'work_item_connected'
  | 'work_item_disconnected'

export type InitiativeActivity = {
  id: string
  actor_id: string | null
  actor_name: string | null
  kind: InitiativeActivityKind
  changed_fields: string[]
  created_at: string
}

export type InitiativeActivityList = { items: InitiativeActivity[]; total: number }

export type InitiativeCreateInput = {
  name: string
  description: string | null
  state: InitiativeState
  start_date: string | null
  target_date: string | null
}

export type InitiativeOwnerCandidate = { user_id: string; display_name: string }
export type InitiativeOwnerCandidateList = { items: InitiativeOwnerCandidate[]; total: number }

export type InitiativeWorkItem = {
  id: string
  project_id: string
  project_name: string
  subject: string
  status: string
  priority: string
  assignee_id: string | null
  due_date: string | null
}

export type InitiativeWorkItemList = {
  items: InitiativeWorkItem[]
  total: number
  connected_work_item_count: number
}

export type InitiativeWorkItemCandidateList = {
  items: InitiativeWorkItem[]
  total: number
}

export type InitiativeSubscription = {
  is_following: boolean
  follower_count: number
}

export const INITIATIVE_STATE_LABELS: Record<InitiativeState, string> = {
  planned: '계획됨',
  in_progress: '진행 중',
  paused: '일시 중지',
  completed: '완료',
  cancelled: '취소됨',
}

export function useInitiatives(labelId = '') {
  const suffix = labelId ? `?label_id=${encodeURIComponent(labelId)}` : ''
  return useQuery({
    queryKey: ['initiatives', { labelId }],
    queryFn: () => api<InitiativeList>(`/api/v1/initiatives${suffix}`),
  })
}

export function useInitiativeLabels(enabled = true) {
  return useQuery({
    queryKey: ['initiative-labels'],
    queryFn: () => api<InitiativeLabelList>('/api/v1/initiatives/labels'),
    enabled,
  })
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['initiatives'] })
}

function invalidateActivity(
  queryClient: ReturnType<typeof useQueryClient>,
  initiativeId: string,
) {
  void queryClient.invalidateQueries({ queryKey: ['initiative-activities', initiativeId] })
}

export function useInitiativeActivities(initiativeId: string, enabled = true) {
  const pageSize = 10
  return useInfiniteQuery({
    queryKey: ['initiative-activities', initiativeId],
    queryFn: ({ pageParam }) =>
      api<InitiativeActivityList>(
        `/api/v1/initiatives/${initiativeId}/activities?limit=${pageSize}&offset=${pageParam}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((total, page) => total + page.items.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    enabled,
    retry: false,
  })
}

function invalidateLabels(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['initiative-labels'] })
  invalidate(queryClient)
}

export function useCreateInitiativeLabel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; color: string }) =>
      api<InitiativeLabel>('/api/v1/initiatives/labels', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateLabels(queryClient),
  })
}

export function useUpdateInitiativeLabel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name: string; color: string }) =>
      api<InitiativeLabel>(`/api/v1/initiatives/labels/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateLabels(queryClient),
  })
}

export function useDeleteInitiativeLabel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/v1/initiatives/labels/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateLabels(queryClient),
  })
}

export function useReplaceInitiativeLabels() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, labelIds }: { id: string; labelIds: string[] }) =>
      api<Initiative>(`/api/v1/initiatives/${id}/labels`, {
        method: 'PUT',
        body: JSON.stringify({ label_ids: labelIds }),
      }),
    onSuccess: (_data, variables) => {
      invalidate(queryClient)
      invalidateActivity(queryClient, variables.id)
    },
  })
}

export function useInitiativeOwnerCandidates(initiativeId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['initiative-owner-candidates', initiativeId],
    queryFn: () =>
      api<InitiativeOwnerCandidateList>(
        `/api/v1/initiatives/${initiativeId}/owner-candidates`,
      ),
    enabled,
    retry: false,
  })
}

export function useTransferInitiativeOwnership() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ownerId }: { id: string; ownerId: string }) =>
      api<Initiative>(`/api/v1/initiatives/${id}/owner`, {
        method: 'POST',
        body: JSON.stringify({ owner_id: ownerId }),
      }),
    onSuccess: (_data, variables) => {
      invalidate(queryClient)
      void queryClient.invalidateQueries({
        queryKey: ['initiative-owner-candidates', variables.id],
      })
      invalidateActivity(queryClient, variables.id)
    },
  })
}

export function useClaimInitiativeOwnership() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<Initiative>(`/api/v1/initiatives/${id}/owner/claim`, { method: 'POST' }),
    onSuccess: (_data, id) => {
      invalidate(queryClient)
      invalidateActivity(queryClient, id)
    },
  })
}

export function useInitiativeWorkItems(initiativeId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['initiative-work-items', initiativeId],
    queryFn: () =>
      api<InitiativeWorkItemList>(`/api/v1/initiatives/${initiativeId}/work-items`),
    enabled,
    retry: false,
  })
}

export function useInitiativeWorkItemCandidates(
  initiativeId: string,
  query: string,
  enabled: boolean,
) {
  const params = new URLSearchParams()
  if (query.trim()) params.set('q', query.trim())
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  return useQuery({
    queryKey: ['initiative-work-item-candidates', initiativeId, query.trim()],
    queryFn: () =>
      api<InitiativeWorkItemCandidateList>(
        `/api/v1/initiatives/${initiativeId}/work-item-candidates${suffix}`,
      ),
    enabled,
    retry: false,
  })
}

function invalidateWorkItemScope(
  queryClient: ReturnType<typeof useQueryClient>,
  initiativeId: string,
) {
  invalidate(queryClient)
  void queryClient.invalidateQueries({ queryKey: ['initiative-work-items', initiativeId] })
  void queryClient.invalidateQueries({
    queryKey: ['initiative-work-item-candidates', initiativeId],
  })
  invalidateActivity(queryClient, initiativeId)
}

export function useConnectInitiativeWorkItem(initiativeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (workPackageId: string) =>
      api<InitiativeWorkItem>(`/api/v1/initiatives/${initiativeId}/work-items`, {
        method: 'POST',
        body: JSON.stringify({ work_package_id: workPackageId }),
      }),
    onSuccess: () => invalidateWorkItemScope(queryClient, initiativeId),
  })
}

export function useDisconnectInitiativeWorkItem(initiativeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (workPackageId: string) =>
      api<void>(`/api/v1/initiatives/${initiativeId}/work-items/${workPackageId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => invalidateWorkItemScope(queryClient, initiativeId),
  })
}

export function useUpdateInitiativeSubscription(initiativeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (following: boolean) =>
      api<InitiativeSubscription>(`/api/v1/initiatives/${initiativeId}/subscription`, {
        method: following ? 'POST' : 'DELETE',
      }),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useCreateInitiative() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: InitiativeCreateInput) =>
      api<Initiative>('/api/v1/initiatives', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useUpdateInitiative() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string
      name?: string
      description?: string | null
      state?: InitiativeState
      start_date?: string | null
      target_date?: string | null
      health?: string | null
      health_note?: string | null
    }) =>
      api<Initiative>(`/api/v1/initiatives/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      invalidate(queryClient)
      invalidateActivity(queryClient, variables.id)
    },
  })
}

export function useDeleteInitiative() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/v1/initiatives/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useConnectProject(initiativeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) =>
      api<Initiative>(`/api/v1/initiatives/${initiativeId}/projects`, {
        method: 'POST',
        body: JSON.stringify({ project_id: projectId }),
      }),
    onSuccess: () => {
      invalidate(queryClient)
      invalidateActivity(queryClient, initiativeId)
    },
  })
}

export function useDisconnectProject(initiativeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) =>
      api<Initiative>(`/api/v1/initiatives/${initiativeId}/projects/${projectId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      invalidate(queryClient)
      invalidateActivity(queryClient, initiativeId)
    },
  })
}
