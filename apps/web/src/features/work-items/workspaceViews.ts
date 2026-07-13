import type { SearchResultItem } from '@/features/search/api'

const DAY_MS = 86_400_000

export type WorkspaceCalendarDay = {
  iso: string
  day: number
  inMonth: boolean
  items: SearchResultItem[]
}

export type WorkspaceCalendar = {
  year: number
  month: number
  weeks: WorkspaceCalendarDay[][]
  withoutDue: SearchResultItem[]
}

export type WorkspaceTimelineRow = {
  item: SearchResultItem
  start: string
  end: string
  leftPercent: number
  widthPercent: number
}

export type WorkspaceTimelineMarker = {
  iso: string
  label: string
  leftPercent: number
}

export type WorkspaceTimeline = {
  start: string | null
  end: string | null
  spanDays: number
  rows: WorkspaceTimelineRow[]
  undated: SearchResultItem[]
  markers: WorkspaceTimelineMarker[]
}

export function shiftWorkspaceMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zeroBased = year * 12 + month - 1 + delta
  return {
    year: Math.floor(zeroBased / 12),
    month: (((zeroBased % 12) + 12) % 12) + 1,
  }
}

export function parseWorkspaceMonth(value?: string | null): { year: number; month: number } | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null
  const [year, month] = value.split('-').map(Number)
  if (year < 1 || year > 9999 || month < 1 || month > 12) return null
  return { year, month }
}

export function workspaceMonthKey(value: { year: number; month: number }): string {
  return `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}`
}

export function buildWorkspaceCalendar(
  year: number,
  month: number,
  items: SearchResultItem[],
): WorkspaceCalendar {
  const byDue = new Map<string, SearchResultItem[]>()
  const withoutDue: SearchResultItem[] = []
  for (const item of items) {
    if (dateIndex(item.due_date) === null) {
      withoutDue.push(item)
      continue
    }
    const due = item.due_date!
    byDue.set(due, [...(byDue.get(due) ?? []), item])
  }

  const first = Date.UTC(year, month - 1, 1)
  const firstWeekday = new Date(first).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const gridStart = first - firstWeekday * DAY_MS
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  const weeks: WorkspaceCalendarDay[][] = []

  for (let offset = 0; offset < cellCount; offset += 7) {
    const week: WorkspaceCalendarDay[] = []
    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const date = new Date(gridStart + (offset + dayOffset) * DAY_MS)
      const iso = date.toISOString().slice(0, 10)
      week.push({
        iso,
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === month - 1,
        items: byDue.get(iso) ?? [],
      })
    }
    weeks.push(week)
  }

  return { year, month, weeks, withoutDue }
}

export function buildWorkspaceTimeline(items: SearchResultItem[]): WorkspaceTimeline {
  const dated: Array<{ item: SearchResultItem; startIndex: number; endIndex: number }> = []
  const undated: SearchResultItem[] = []

  for (const item of items) {
    const startIndex = dateIndex(item.start_date)
    const dueIndex = dateIndex(item.due_date)
    if (startIndex === null && dueIndex === null) {
      undated.push(item)
      continue
    }
    const first = startIndex ?? dueIndex!
    const last = dueIndex ?? startIndex!
    dated.push({
      item,
      startIndex: Math.min(first, last),
      endIndex: Math.max(first, last),
    })
  }

  if (dated.length === 0) {
    return { start: null, end: null, spanDays: 0, rows: [], undated, markers: [] }
  }

  const rangeStart = Math.min(...dated.map((row) => row.startIndex))
  const rangeEnd = Math.max(...dated.map((row) => row.endIndex))
  const spanDays = Math.max(1, rangeEnd - rangeStart + 1)
  const rows = dated.map(({ item, startIndex, endIndex }) => {
    const leftPercent = ((startIndex - rangeStart) / spanDays) * 100
    const naturalWidth = ((endIndex - startIndex + 1) / spanDays) * 100
    return {
      item,
      start: indexDate(startIndex),
      end: indexDate(endIndex),
      leftPercent,
      widthPercent: Math.min(100 - leftPercent, Math.max(naturalWidth, 1.25)),
    }
  })

  return {
    start: indexDate(rangeStart),
    end: indexDate(rangeEnd),
    spanDays,
    rows,
    undated,
    markers: buildMarkers(rangeStart, rangeEnd),
  }
}

function buildMarkers(start: number, end: number): WorkspaceTimelineMarker[] {
  const span = end - start + 1
  const step = span <= 31 ? 1 : span <= 120 ? 7 : 30
  const markers: WorkspaceTimelineMarker[] = []
  for (let index = start; index <= end; index += step) {
    const iso = indexDate(index)
    markers.push({
      iso,
      label: step === 1 ? iso.slice(5) : iso,
      leftPercent: ((index - start) / span) * 100,
    })
  }
  return markers
}

function dateIndex(value?: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const timestamp = Date.UTC(year, month - 1, day)
  if (new Date(timestamp).toISOString().slice(0, 10) !== value) return null
  return Math.floor(timestamp / DAY_MS)
}

function indexDate(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10)
}
