import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, api } from '@/lib/api'
import { decideOnPatchError } from '@/lib/conflict'

import type {
  ActivityList,
  Comment,
  CommentThreadList,
  ConflictBody,
  CostEntryList,
  RelationList,
  TimeEntryList,
  WorkPackage,
  WorkPackageList,
  WorkPackagePatch,
} from './types'

export type WpFilters = {
  status?: string
  priority?: string
  type?: string
  assignee_id?: string
  milestone_id?: string
  customer_id?: string
  cycle_id?: string
  module_id?: string
  q?: string
  sort?: string
  no_cycle?: string
  open_only?: string
  custom_fields?: string
  cf_field?: string
  cf_op?: string
  cf_value?: string
}

// The server caps a single page at 500. Fetch every page so no view silently
// truncates at the old 200-item default (fable5 audit: board/tree/calendar/timeline
// dropped items past the first page while the list still showed the true total).
// Bounded so a pathological project can't loop forever; the cap is well past the
// 5000-row CSV import limit.
const PAGE_SIZE = 500
const MAX_PAGES = 20

async function fetchAllWorkPackages(
  projectId: string,
  filters: WpFilters,
): Promise<WorkPackageList> {
  const items: WorkPackage[] = []
  let total = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value)
    }
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(page * PAGE_SIZE))
    const res = await api<WorkPackageList>(
      `/api/v1/projects/${projectId}/work-packages?${params.toString()}`,
    )
    items.push(...res.items)
    total = res.total
    if (items.length >= total || res.items.length < PAGE_SIZE) break
  }
  return { items, total }
}

export function useWorkPackages(projectId: string, filters: WpFilters) {
  return useQuery({
    queryKey: ['work-packages', projectId, filters],
    queryFn: () => fetchAllWorkPackages(projectId, filters),
  })
}

export type WatcherList = {
  items: Array<{ user_id: string; display_name: string; profile_image_url?: string | null }>
  total: number
  me_watching: boolean
}

export function useWatchers(wpId: string | null) {
  return useQuery({
    queryKey: ['wp-watchers', wpId],
    queryFn: () => api<WatcherList>(`/api/v1/work-packages/${wpId}/watchers`),
    enabled: wpId !== null,
  })
}

export function useSetWatching(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (watching: boolean) =>
      api<void>(`/api/v1/work-packages/${wpId}/watchers/me`, {
        method: watching ? 'PUT' : 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wp-watchers', wpId] })
    },
  })
}

export function useWorkPackage(wpId: string | null) {
  return useQuery({
    queryKey: ['work-package', wpId],
    queryFn: () => api<WorkPackage>(`/api/v1/work-packages/${wpId}`),
    enabled: wpId !== null,
  })
}

export function useRelations(wpId: string | null) {
  return useQuery({
    queryKey: ['work-package-relations', wpId],
    queryFn: () => api<RelationList>(`/api/v1/work-packages/${wpId}/relations`),
    enabled: wpId !== null,
  })
}

export function useCreateRelation(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { target_id: string; relation_type: string }) =>
      api(`/api/v1/work-packages/${wpId}/relations`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['work-package-relations', wpId] })
    },
  })
}

export function useDeleteRelation(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (relationId: string) =>
      api<void>(`/api/v1/work-packages/${wpId}/relations/${relationId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['work-package-relations', wpId] })
    },
  })
}

export function useTimeEntries(wpId: string | null) {
  return useQuery({
    queryKey: ['time-entries', wpId],
    queryFn: () => api<TimeEntryList>(`/api/v1/work-packages/${wpId}/time-entries`),
    enabled: wpId !== null,
  })
}

export function useLogTime(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { hours: number; spent_on: string; comment: string | null }) =>
      api(`/api/v1/work-packages/${wpId}/time-entries`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['time-entries', wpId] })
      // Dashboard rolls up spent hours — refresh it too.
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useDeleteTimeEntry(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) =>
      api<void>(`/api/v1/work-packages/${wpId}/time-entries/${entryId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['time-entries', wpId] })
    },
  })
}

export function useCostEntries(wpId: string | null) {
  return useQuery({
    queryKey: ['cost-entries', wpId],
    queryFn: () => api<CostEntryList>(`/api/v1/work-packages/${wpId}/cost-entries`),
    enabled: wpId !== null,
  })
}

export function useLogCost(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      amount: number
      kind: string
      spent_on: string
      comment: string | null
    }) =>
      api(`/api/v1/work-packages/${wpId}/cost-entries`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cost-entries', wpId] })
      // Dashboard rolls up cost — refresh it too.
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useDeleteCostEntry(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) =>
      api<void>(`/api/v1/work-packages/${wpId}/cost-entries/${entryId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cost-entries', wpId] })
    },
  })
}

type FeedCursor = { createdAt: string; id: string }

const ACTIVITY_PAGE_SIZE = 20
const COMMENT_THREAD_PAGE_SIZE = 20

function nextCursor(page: {
  next_cursor_created_at: string | null
  next_cursor_id: string | null
}): FeedCursor | undefined {
  return page.next_cursor_created_at && page.next_cursor_id
    ? { createdAt: page.next_cursor_created_at, id: page.next_cursor_id }
    : undefined
}

export function useCommentThreads(
  wpId: string | null,
  order: 'asc' | 'desc',
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: ['work-package-comments', wpId, order],
    initialPageParam: null as FeedCursor | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(COMMENT_THREAD_PAGE_SIZE),
        order,
      })
      if (pageParam) {
        params.set('cursor_created_at', pageParam.createdAt)
        params.set('cursor_id', pageParam.id)
      }
      return api<CommentThreadList>(
        `/api/v1/work-packages/${wpId}/comment-threads?${params.toString()}`,
      )
    },
    getNextPageParam: nextCursor,
    enabled: wpId !== null && enabled,
    retry: false,
  })
}

export type ActivityFilters = {
  action?: 'created' | 'field_changed' | 'commented'
  field?: string
  fieldNot?: string
}

export function useActivities(
  wpId: string | null,
  filters: ActivityFilters = {},
  order: 'asc' | 'desc' = 'asc',
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: [
      'work-package-activities',
      wpId,
      filters.action,
      filters.field,
      filters.fieldNot,
      order,
    ],
    initialPageParam: null as FeedCursor | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(ACTIVITY_PAGE_SIZE), order })
      if (filters.action) params.set('action', filters.action)
      if (filters.field) params.set('field', filters.field)
      if (filters.fieldNot) params.set('field_not', filters.fieldNot)
      if (pageParam) {
        params.set('cursor_created_at', pageParam.createdAt)
        params.set('cursor_id', pageParam.id)
      }
      return api<ActivityList>(
        `/api/v1/work-packages/${wpId}/activities?${params.toString()}`,
      )
    },
    getNextPageParam: nextCursor,
    enabled: wpId !== null && enabled,
    retry: false,
  })
}

export function useCreateComment(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      body: string
      parent_id?: string | null
      mentioned_user_ids?: string[]
    }) =>
      api<Comment>(`/api/v1/work-packages/${wpId}/comments`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      // A comment also appends a 'commented' activity — refresh both.
      void queryClient.invalidateQueries({ queryKey: ['work-package-comments', wpId] })
      void queryClient.invalidateQueries({ queryKey: ['work-package-activities', wpId] })
    },
  })
}

export type DuplicateResult = {
  work_package: WorkPackage
  /** custom values that failed today's write rules and were not copied */
  skipped_custom_values: number
}

export function useDuplicateWorkPackage(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (wpId: string) =>
      api<DuplicateResult>(`/api/v1/work-packages/${wpId}/duplicate`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['work-packages', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export type BulkUpdateResult = {
  updated_ids: string[]
  unchanged_ids: string[]
  /** opaque — missing and cross-project ids look identical (existence hiding) */
  skipped_ids: string[]
}

export function useBulkUpdate(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      ids: string[]
      patch: { status?: string; assignee_id?: string | null; priority?: string }
    }) =>
      api<BulkUpdateResult>(`/api/v1/projects/${projectId}/work-packages/bulk-update`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['work-packages', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export type ProjectRelationList = {
  items: { id: string; source_id: string; target_id: string; relation_type: string }[]
  total: number
  truncated: boolean
}

export function useProjectRelations(projectId: string) {
  return useQuery({
    queryKey: ['project-relations', projectId],
    queryFn: () => api<ProjectRelationList>(`/api/v1/projects/${projectId}/relations`),
  })
}

export function useToggleReaction(wpId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ commentId, key, on }: { commentId: string; key: string; on: boolean }) =>
      // encodeURIComponent: a raw '#' (keycap #⃣) would start a URL fragment.
      api(`/api/v1/comments/${commentId}/reactions/${encodeURIComponent(key)}`, {
        method: on ? 'PUT' : 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['work-package-comments', wpId] })
    },
  })
}

export type WorkPackageCreateInput = {
  subject: string
  type?: string
  status?: string
  priority?: string
  assignee_id?: string | null
  due_date?: string | null
}

export function useCreateWorkPackage(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: WorkPackageCreateInput) =>
      api<WorkPackage>(`/api/v1/projects/${projectId}/work-packages`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['work-packages', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['project-activities', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

/** PATCH with optimistic-concurrency handling: on 409 the conflict decision
 *  (pure function, unit-tested) notifies + invalidates so the UI reloads the
 *  fresh resource (PLAN §6.2/§8). */
export function usePatchWorkPackage(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ wpId, patch }: { wpId: string; patch: WorkPackagePatch }) =>
      api<WorkPackage>(`/api/v1/work-packages/${wpId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['work-package', updated.id], updated)
      void queryClient.invalidateQueries({ queryKey: ['work-packages', projectId] })
      // A field change (status/priority/dates/assignee) also moves dashboard rollups,
      // the project activity feed, and the drawer's own history — refresh them all.
      void queryClient.invalidateQueries({ queryKey: ['dashboard', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['project-activities', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['work-package-activities', updated.id] })
      void queryClient.invalidateQueries({ queryKey: ['workspace-work-items'] })
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (error, { wpId }) => {
      // The drawer surfaces the failure inline via patch.isError; here we only handle
      // the 409 reload so the editor shows the latest server state (non-409 errors
      // keep the user's input on screen so nothing is silently lost).
      if (!(error instanceof ApiError)) return
      const decision = decideOnPatchError(error.status)
      if (decision.invalidate) {
        const conflict = error.payload as ConflictBody | null
        if (conflict?.current) {
          queryClient.setQueryData(['work-package', wpId], conflict.current)
        }
        void queryClient.invalidateQueries({ queryKey: ['work-package', wpId] })
        void queryClient.invalidateQueries({ queryKey: ['work-packages', projectId] })
        void queryClient.invalidateQueries({ queryKey: ['workspace-work-items'] })
      }
    },
  })
}

export type MoveRefSummary = { count: number; names: string[]; overflow: number }

export type MoveCleared = {
  parent: boolean
  children: MoveRefSummary
  milestone: boolean
  cycle: boolean
  module: boolean
  relations: MoveRefSummary
  custom_values: MoveRefSummary
  document_links: MoveRefSummary
  watchers_removed: MoveRefSummary
  assignee_cleared: boolean
}

export type MoveResult = {
  work_package: WorkPackage | null
  cleared: MoveCleared
  dry_run: boolean
}

export function useMoveWorkPackage(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      wpId: string
      target_project_id: string
      expected_version: number
      dry_run?: boolean
    }) =>
      api<MoveResult>(`/api/v1/work-packages/${input.wpId}/move`, {
        method: 'POST',
        body: JSON.stringify({
          target_project_id: input.target_project_id,
          expected_version: input.expected_version,
          dry_run: input.dry_run ?? false,
        }),
      }),
    onSuccess: (result) => {
      if (result.dry_run) return
      void queryClient.invalidateQueries({ queryKey: ['work-packages', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['work-package'] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}
