/* Gantt date conversions (Pass 73/74). date-only strings ↔ DHTMLX local-
   midnight Dates. UTC string math / local date PARTS only — never Date
   arithmetic, so DST and timezone offsets cannot shift a calendar day
   (§6.1, v74.1 R1-⑥). DHTMLX end_date is EXCLUSIVE; OneFlow due_date is
   INCLUSIVE — the ±1-day pair below is that bridge. */

export function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

export function prevDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

/** DHTMLX drag result → PATCH fields (due = exclusive end − 1 day). */
export function ganttDatesToPatch(
  start: Date,
  end: Date,
): { start_date: string; due_date: string } {
  const iso = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
      dt.getDate(),
    ).padStart(2, '0')}`
  return { start_date: iso(start), due_date: prevDay(iso(end)) }
}
