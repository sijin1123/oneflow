/* Local-timezone date/time helpers (framework-free; importable under `node --test`).

   Timestamps (created_at/updated_at) are full instants and MUST be shown in the
   viewer's local zone — slicing the raw UTC ISO string showed KST users a time 9h
   off and put the calendar's "today" on the wrong day before 09:00. Date-only
   fields ('YYYY-MM-DD') still travel as strings and never go through a JS Date. */

/** Today's LOCAL calendar date as 'YYYY-MM-DD' (for the calendar "today" marker
    and default date-entry values). */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** The LOCAL {year, month} of a date (month is 1-based) — the calendar's initial
    view and "이번 달" target. */
export function localYearMonth(now: Date = new Date()): { year: number; month: number } {
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** Localized short date+time for a full-instant timestamp. One formatting path so
    every panel (history, activity feed, notifications) shows the same clock. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}
