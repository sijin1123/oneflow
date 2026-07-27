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

export function parseZoomLevel(value: string | null, fallback: ZoomLevel = 'fit'): ZoomLevel {
  return ZOOM_LEVELS.includes(value as ZoomLevel) ? (value as ZoomLevel) : fallback
}

export function parseTimelineFocus(value: string | null, fallback: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return fallback
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value!
    : fallback
}

export function shiftTimelineFocus(value: string, zoom: ZoomLevel, direction: -1 | 1): string {
  const date = new Date(`${value}T12:00:00Z`)
  const days = zoom === 'day' ? 1 : zoom === 'week' ? 7 : 30
  date.setUTCDate(date.getUTCDate() + days * direction)
  return date.toISOString().slice(0, 10)
}
