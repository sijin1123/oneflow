/* Pure swimlane grouping for the board (Pass 28 — web only, no API change).
   Lanes preserve the incoming item order; the "unassigned"/"none" lane always
   sorts last; empty lanes are dropped by construction. */

import type { WorkPackage } from './types.ts'
import { PRIORITY_LABELS } from './types.ts'

export type LaneBy = 'none' | 'assignee' | 'priority'

export type Lane = {
  key: string
  label: string
  items: WorkPackage[]
}

const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low', 'none']

export function buildLanes(
  items: WorkPackage[],
  laneBy: LaneBy,
  memberName: (id: string | null) => string,
): Lane[] {
  if (laneBy === 'none') return [{ key: 'all', label: '', items }]

  const byKey = new Map<string, WorkPackage[]>()
  for (const wp of items) {
    const key = laneBy === 'assignee' ? (wp.assignee_id ?? 'unassigned') : wp.priority
    const bucket = byKey.get(key) ?? []
    bucket.push(wp)
    byKey.set(key, bucket)
  }

  const lanes: Lane[] = [...byKey.entries()].map(([key, laneItems]) => ({
    key,
    label:
      laneBy === 'assignee'
        ? key === 'unassigned'
          ? '미배정'
          : memberName(key)
        : (PRIORITY_LABELS[key as keyof typeof PRIORITY_LABELS] ?? key),
    items: laneItems,
  }))

  lanes.sort((a, b) => {
    if (laneBy === 'assignee') {
      if (a.key === 'unassigned') return 1
      if (b.key === 'unassigned') return -1
      return a.label.localeCompare(b.label, 'ko')
    }
    return PRIORITY_ORDER.indexOf(a.key) - PRIORITY_ORDER.indexOf(b.key)
  })
  return lanes
}
