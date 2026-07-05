/* Pure date helpers for the lightweight timeline (no Gantt library — avoids the
   GPL/AGPL license risk flagged in PLAN §12). Date-only 'YYYY-MM-DD' strings are
   parsed as UTC day indices so positioning never depends on the local timezone. */

import type { WorkPackage } from './types'

const MS_PER_DAY = 86_400_000

/** 'YYYY-MM-DD' -> integer day index (UTC), or null. */
export function dayIndex(date: string | null): number | null {
  if (!date) return null
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return null
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY)
}

export function indexToDate(idx: number): Date {
  return new Date(idx * MS_PER_DAY)
}

export type TimelineBar = {
  wp: WorkPackage
  startIdx: number
  endIdx: number
  /** true when the work package only had one of start/due */
  point: boolean
}

export type TimelineModel = {
  rangeStart: number
  rangeEnd: number
  totalDays: number
  bars: TimelineBar[]
  undated: WorkPackage[]
  /** first-of-month day indices within the range, for gridlines/labels */
  monthMarks: number[]
}

export function buildTimeline(items: WorkPackage[]): TimelineModel | null {
  const bars: TimelineBar[] = []
  const undated: WorkPackage[] = []

  for (const wp of items) {
    const s = dayIndex(wp.start_date)
    const e = dayIndex(wp.due_date)
    if (s === null && e === null) {
      undated.push(wp)
      continue
    }
    const startIdx = s ?? (e as number)
    const endIdx = e ?? (s as number)
    bars.push({ wp, startIdx: Math.min(startIdx, endIdx), endIdx: Math.max(startIdx, endIdx), point: s === null || e === null })
  }

  if (bars.length === 0) return null

  let rangeStart = Infinity
  let rangeEnd = -Infinity
  for (const b of bars) {
    rangeStart = Math.min(rangeStart, b.startIdx)
    rangeEnd = Math.max(rangeEnd, b.endIdx)
  }
  // Pad a few days on each side for breathing room.
  rangeStart -= 2
  rangeEnd += 2
  const totalDays = rangeEnd - rangeStart + 1

  const monthMarks: number[] = []
  const first = indexToDate(rangeStart)
  const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1))
  while (Math.floor(cursor.getTime() / MS_PER_DAY) <= rangeEnd) {
    const idx = Math.floor(cursor.getTime() / MS_PER_DAY)
    if (idx >= rangeStart) monthMarks.push(idx)
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return { rangeStart, rangeEnd, totalDays, bars, undated, monthMarks }
}

export function pct(value: number, total: number): number {
  return (value / total) * 100
}

export function monthLabel(idx: number): string {
  const d = indexToDate(idx)
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
