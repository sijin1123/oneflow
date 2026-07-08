/* Timeline helpers.
   dayIndex/pct survive for the modules timeline-lite (Pass 59); the work-
   package timeline itself renders via DHTMLX Gantt since Pass 73 — its old
   layout model (buildTimeline/buildConnectors) was removed with it. */

const MS_PER_DAY = 86_400_000

export function dayIndex(date: string | null): number | null {
  if (!date) return null
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return null
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY)
}

export function pct(value: number, total: number): number {
  return (value / total) * 100
}

export type ProjectRelation = {
  id: string
  source_id: string
  target_id: string
  relation_type: string
}

export const ZOOM_LEVELS = ['fit', 'month', 'week', 'day'] as const
export type ZoomLevel = (typeof ZOOM_LEVELS)[number]

export const ZOOM_LABELS: Record<ZoomLevel, string> = {
  fit: '자동',
  month: '월',
  week: '주',
  day: '일',
}

