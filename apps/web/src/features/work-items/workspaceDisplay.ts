import type { SearchResultItem } from '@/features/search/api'

export const WORKSPACE_COLUMNS = [
  'project',
  'status',
  'priority',
  'type',
  'assignee',
  'start',
  'due',
  'updated',
] as const

export type WorkspaceColumn = (typeof WORKSPACE_COLUMNS)[number]
export type WorkspaceGroupBy = 'state' | 'priority' | 'project' | 'assignee' | 'none'

export const DEFAULT_WORKSPACE_COLUMNS: WorkspaceColumn[] = [...WORKSPACE_COLUMNS]

export type WorkspaceItemGroup = {
  key: string
  label: string
  items: SearchResultItem[]
}

const STATE_GROUPS: Array<{ key: string; label: string; values: SearchResultItem['status'][] }> = [
  { key: 'backlog', label: 'Backlog', values: ['backlog'] },
  { key: 'unstarted', label: 'Unstarted', values: ['todo'] },
  { key: 'started', label: 'Started', values: ['in_progress', 'in_review'] },
  { key: 'completed', label: 'Completed', values: ['done', 'cancelled'] },
]

const PRIORITY_GROUPS: Array<{ key: SearchResultItem['priority']; label: string }> = [
  { key: 'urgent', label: '긴급' },
  { key: 'high', label: '높음' },
  { key: 'medium', label: '보통' },
  { key: 'low', label: '낮음' },
  { key: 'none', label: '우선순위 없음' },
]

export function parseWorkspaceColumns(value: string | null): WorkspaceColumn[] {
  if (!value) return [...DEFAULT_WORKSPACE_COLUMNS]
  const selected: WorkspaceColumn[] = []
  for (const item of value.split(',')) {
    if (
      WORKSPACE_COLUMNS.includes(item as WorkspaceColumn)
      && !selected.includes(item as WorkspaceColumn)
    ) {
      selected.push(item as WorkspaceColumn)
    }
  }
  return selected.length > 0 ? selected : [...DEFAULT_WORKSPACE_COLUMNS]
}

export function serializeWorkspaceColumns(columns: WorkspaceColumn[]): string {
  return columns.join(',')
}

export function buildWorkspaceGroups(
  items: SearchResultItem[],
  groupBy: WorkspaceGroupBy,
  showEmptyGroups: boolean,
): WorkspaceItemGroup[] {
  if (groupBy === 'none') return [{ key: 'all', label: '모든 작업', items }]
  if (groupBy === 'state') {
    return STATE_GROUPS
      .map((group) => ({
        key: group.key,
        label: group.label,
        items: items.filter((item) => group.values.includes(item.status)),
      }))
      .filter((group) => showEmptyGroups || group.items.length > 0)
  }
  if (groupBy === 'priority') {
    return PRIORITY_GROUPS
      .map((group) => ({
        key: group.key,
        label: group.label,
        items: items.filter((item) => item.priority === group.key),
      }))
      .filter((group) => showEmptyGroups || group.items.length > 0)
  }

  const grouped = new Map<string, WorkspaceItemGroup>()
  for (const item of items) {
    const key = groupBy === 'project'
      ? item.project_id
      : (item.assignee_id ?? (item.assignee_name ? `name:${item.assignee_name}` : 'unassigned'))
    const label = groupBy === 'project' ? item.project_name : (item.assignee_name ?? '미배정')
    const current = grouped.get(key) ?? { key, label, items: [] }
    current.items.push(item)
    grouped.set(key, current)
  }
  return [...grouped.values()].sort((left, right) => left.label.localeCompare(right.label, 'ko'))
}

export function shortWorkspaceItemId(item: SearchResultItem) {
  return `${item.project_key}-${item.id.replaceAll('-', '').slice(0, 6).toUpperCase()}`
}
