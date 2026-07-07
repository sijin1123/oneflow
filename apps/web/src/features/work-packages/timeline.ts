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

export function buildTimeline(
  items: WorkPackage[],
  /** extra day indices (milestone due dates, today) that must stay inside the
      visible range so their markers are never clipped off the edge */
  extraDays: number[] = [],
): TimelineModel | null {
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
  for (const d of extraDays) {
    rangeStart = Math.min(rangeStart, d)
    rangeEnd = Math.max(rangeEnd, d)
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


export type ProjectRelation = {
  id: string
  source_id: string
  target_id: string
  relation_type: string
}

export type Connector = {
  id: string
  /** all coordinates in DAY indices (x) and ROW indices (y) — the renderer
      converts x via pct() and y via rowHeight */
  fromDay: number
  fromRow: number
  toDay: number
  toRow: number
  type: 'blocks' | 'precedes'
}

export type ConnectorModel = {
  connectors: Connector[]
  /** dependencies hidden because an endpoint has no schedule bar (v20.1 R1-④);
      `relates` rows are NOT dependencies and are never counted */
  omittedMissingSchedule: number
}

/** Dependency connectors between timeline bars (pure — Pass 20 PR-AL).
    follows(A→B) normalizes to precedes(B→A); duplicate (source,target) pairs
    keep blocks over precedes; both endpoints must have bars. */
export function buildConnectors(
  bars: TimelineBar[],
  relations: ProjectRelation[],
): ConnectorModel {
  const rowOf = new Map<string, number>()
  const barOf = new Map<string, TimelineBar>()
  bars.forEach((b, i) => {
    rowOf.set(b.wp.id, i)
    barOf.set(b.wp.id, b)
  })

  type Norm = { id: string; source: string; target: string; type: 'blocks' | 'precedes' }
  const normalized: Norm[] = []
  for (const r of relations) {
    if (r.relation_type === 'blocks' || r.relation_type === 'precedes') {
      normalized.push({ id: r.id, source: r.source_id, target: r.target_id, type: r.relation_type })
    } else if (r.relation_type === 'follows') {
      // A follows B  ==  B precedes A (direction normalization — R1-②)
      normalized.push({ id: r.id, source: r.target_id, target: r.source_id, type: 'precedes' })
    }
    // relates: direction-free, not a dependency — never drawn, never counted.
  }

  // Dedupe per (source,target): blocks wins over precedes (R1-⑤).
  const byPair = new Map<string, Norm>()
  for (const n of normalized) {
    const key = `${n.source}→${n.target}`
    const existing = byPair.get(key)
    if (!existing || (existing.type === 'precedes' && n.type === 'blocks')) byPair.set(key, n)
  }

  const connectors: Connector[] = []
  let omitted = 0
  for (const n of byPair.values()) {
    const from = barOf.get(n.source)
    const to = barOf.get(n.target)
    if (!from || !to) {
      omitted += 1
      continue
    }
    connectors.push({
      id: n.id,
      fromDay: from.endIdx + 1, // right edge of the source bar
      fromRow: rowOf.get(n.source) as number,
      toDay: to.startIdx,
      toRow: rowOf.get(n.target) as number,
      type: n.type,
    })
  }
  return { connectors, omittedMissingSchedule: omitted }
}
