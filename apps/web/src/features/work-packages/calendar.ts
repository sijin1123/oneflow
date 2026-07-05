/* Pure month-grid assembly for the calendar view (Phase 2 캘린더).
   Date math uses UTC exclusively and work packages are bucketed onto days by exact
   'YYYY-MM-DD' string equality — the WP date value is never round-tripped through a
   local JS Date, so there is no timezone off-by-one (§6.1). */

import type { WorkPackage } from './types'

export type CalendarDay = {
  iso: string // 'YYYY-MM-DD'
  day: number // 1..31
  inMonth: boolean // belongs to the displayed month (vs. padding)
  items: WorkPackage[] // WPs whose due_date === iso
}

export type CalendarMonth = {
  year: number
  month: number // 1..12
  weeks: CalendarDay[][] // Sunday-first rows of 7
}

const DAY_MS = 86_400_000

function iso(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

export function buildCalendar(
  year: number,
  month: number, // 1..12
  items: WorkPackage[],
): CalendarMonth {
  // Bucket by due date once — matching is a plain string compare (§6.1).
  const byDue = new Map<string, WorkPackage[]>()
  for (const wp of items) {
    if (!wp.due_date) continue
    const arr = byDue.get(wp.due_date) ?? []
    arr.push(wp)
    byDue.set(wp.due_date, arr)
  }

  const firstOfMonth = Date.UTC(year, month - 1, 1)
  const firstWeekday = new Date(firstOfMonth).getUTCDay() // 0=Sun
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const gridStart = firstOfMonth - firstWeekday * DAY_MS
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7

  const weeks: CalendarDay[][] = []
  let week: CalendarDay[] = []
  for (let i = 0; i < cellCount; i++) {
    const ts = gridStart + i * DAY_MS
    const d = new Date(ts)
    const key = iso(ts)
    week.push({
      iso: key,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month - 1,
      items: byDue.get(key) ?? [],
    })
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  return { year, month, weeks }
}

/** Add `delta` months to a {year, month} pair, normalizing the rollover. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + delta
  return { year: Math.floor(zero / 12), month: (((zero % 12) + 12) % 12) + 1 }
}
