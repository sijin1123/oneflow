import {
  PRIORITY_LABELS,
  WP_PRIORITIES,
  WP_STATUSES,
  type WorkPackage,
  type WpPriority,
  type WpStatus,
} from './types.ts'

export const PROJECT_WORK_ITEM_GROUPS = ['status', 'priority', 'none'] as const
export type ProjectWorkItemGroupBy = (typeof PROJECT_WORK_ITEM_GROUPS)[number]

export const PROJECT_WORK_ITEM_GROUP_LABELS: Record<ProjectWorkItemGroupBy, string> = {
  status: '상태',
  priority: '우선순위',
  none: '그룹 없음',
}

export type ProjectWorkItemGroup = {
  key: string
  label: string
  items: WorkPackage[]
  prefill?: { status?: WpStatus; priority?: WpPriority }
}

export function parseProjectWorkItemGroup(raw: string | null): ProjectWorkItemGroupBy {
  return PROJECT_WORK_ITEM_GROUPS.includes(raw as ProjectWorkItemGroupBy)
    ? (raw as ProjectWorkItemGroupBy)
    : 'status'
}

export function serializeProjectWorkItemGroup(groupBy: ProjectWorkItemGroupBy): string | null {
  return groupBy === 'status' ? null : groupBy
}

export function buildProjectWorkItemGroups(
  items: WorkPackage[],
  groupBy: ProjectWorkItemGroupBy,
  statusLabel: (status: string) => string,
): ProjectWorkItemGroup[] {
  if (groupBy === 'none') {
    return [{ key: 'all', label: '모든 작업', items }]
  }

  if (groupBy === 'priority') {
    return WP_PRIORITIES.map((priority) => ({
      key: priority,
      label: PRIORITY_LABELS[priority],
      items: items.filter((item) => item.priority === priority),
      prefill: { priority },
    }))
  }

  return WP_STATUSES.map((status) => ({
    key: status,
    label: statusLabel(status),
    items: items.filter((item) => item.status === status),
    prefill: { status },
  }))
}
