/* Pure comparator retained for preference/unit coverage. The paginated
   directory delegates production ordering to the API so page boundaries stay
   deterministic. */

import type { ProjectHealth, ProjectListItem } from './types'

export const SORT_KEYS = [
  'default',
  'name',
  'work_package_count',
  'open_work_package_count',
  'overdue_count',
  'member_count',
  'health',
] as const

export type ProjectSortKey = (typeof SORT_KEYS)[number]
export type SortDir = 'asc' | 'desc'

export const SORT_LABELS: Record<ProjectSortKey, string> = {
  default: '기본 (생성순)',
  name: '이름',
  work_package_count: '작업',
  open_work_package_count: '진행 중',
  overdue_count: '기한 초과',
  member_count: '멤버',
  health: '헬스',
}

// on_track < at_risk < off_track; unset sorts LAST in both directions.
const HEALTH_ORDER: Record<ProjectHealth, number> = { on_track: 0, at_risk: 1, off_track: 2 }

export function sortProjects(
  items: ProjectListItem[],
  key: ProjectSortKey,
  dir: SortDir,
): ProjectListItem[] {
  if (key === 'default') return items
  const sign = dir === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    let cmp = 0
    if (key === 'name') {
      cmp = a.name.localeCompare(b.name, 'ko')
    } else if (key === 'health') {
      const av = a.health === null ? null : HEALTH_ORDER[a.health]
      const bv = b.health === null ? null : HEALTH_ORDER[b.health]
      if (av === null && bv === null) cmp = 0
      else if (av === null) return 1 // unset last regardless of direction
      else if (bv === null) return -1
      else cmp = av - bv
    } else {
      cmp = a[key] - b[key]
    }
    // Stable tie-breaker: name asc, independent of direction.
    return cmp !== 0 ? cmp * sign : a.name.localeCompare(b.name, 'ko')
  })
}
