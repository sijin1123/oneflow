import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { GridDensity } from '@/components/ui/data-grid'
import type { SearchResultItem } from '@/features/search/api'
import { localYearMonth, todayISO } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import {
  buildWorkspaceCalendar,
  parseWorkspaceMonth,
  shiftWorkspaceMonth,
  workspaceMonthKey,
} from './workspaceViews'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export function WorkspaceCalendarView({
  items,
  density,
  total,
  rangeLabel,
  month,
  onMonthChange,
  onOpen,
}: {
  items: SearchResultItem[]
  density: GridDensity
  total: number
  rangeLabel: string
  month: string | null
  onMonthChange: (month: string | null) => void
  onOpen: (item: SearchResultItem) => void
}) {
  const cursor = parseWorkspaceMonth(month) ?? localYearMonth()
  const calendar = useMemo(
    () => buildWorkspaceCalendar(cursor.year, cursor.month, items),
    [cursor.month, cursor.year, items],
  )
  const today = todayISO()
  const monthCount = calendar.weeks.flatMap((week) => week)
    .filter((day) => day.inMonth)
    .reduce((count, day) => count + day.items.length, 0)

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="전체 작업 Calendar" data-density={density}>
      <header className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-y border-of-border px-3 py-1.5 text-xs">
        <strong className="tabular-nums text-of-text">
          {cursor.year}.{String(cursor.month).padStart(2, '0')}
        </strong>
        <Badge variant="neutral">{monthCount}건</Badge>
        <Badge variant="neutral">기한 미정 {calendar.withoutDue.length}</Badge>
        <div className="ml-auto flex items-center gap-1">
          {total > items.length ? <span className="mr-2 text-of-muted">{rangeLabel} 기준</span> : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="이전 달"
            disabled={cursor.year === 1 && cursor.month === 1}
            onClick={() => onMonthChange(workspaceMonthKey(shiftWorkspaceMonth(cursor.year, cursor.month, -1)))}
          >
            <ChevronLeft size={14} />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onMonthChange(null)}>
            이번 달
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="다음 달"
            disabled={cursor.year === 9999 && cursor.month === 12}
            onClick={() => onMonthChange(workspaceMonthKey(shiftWorkspaceMonth(cursor.year, cursor.month, 1)))}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </header>

      <div className="of-scrollbar min-h-0 flex-1 overflow-auto">
        <div className="min-w-[48rem] p-2">
          <div className="grid grid-cols-7 border-b border-of-border text-center text-[11px] font-medium text-of-muted">
            {WEEKDAYS.map((weekday) => <div key={weekday} className="py-1.5">{weekday}</div>)}
          </div>
          <div className="grid grid-cols-7 border-l border-of-border">
            {calendar.weeks.flat().map((day) => (
              <div
                key={day.iso}
                className={cn(
                  'min-w-0 border-b border-r border-of-border p-1.5',
                  density === 'compact' ? 'min-h-20' : 'min-h-28',
                  !day.inMonth && 'bg-of-surface-2/50',
                )}
              >
                <span
                  className={cn(
                    'mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums',
                    day.inMonth ? 'text-of-text' : 'text-of-muted',
                    day.iso === today && 'bg-of-accent font-semibold text-white',
                  )}
                >
                  {day.day}
                </span>
                <div className="space-y-1">
                  {day.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      title={`${item.project_key} · ${item.subject}`}
                      className="block w-full truncate rounded-[4px] bg-of-accent-soft px-1.5 py-1 text-left text-[11px] text-of-accent hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                      onClick={() => onOpen(item)}
                    >
                      <span className="mr-1 font-mono opacity-70">{item.project_key}</span>
                      {item.subject}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <UndatedItems items={calendar.withoutDue} density={density} onOpen={onOpen} />
        </div>
      </div>
    </section>
  )
}

function UndatedItems({
  items,
  density,
  onOpen,
}: {
  items: SearchResultItem[]
  density: GridDensity
  onOpen: (item: SearchResultItem) => void
}) {
  return (
    <section className="mt-2 border-t border-of-border pt-2" aria-label="기한 미정 작업">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium">
        기한 미정 <Badge variant="neutral">{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-of-muted">현재 페이지의 모든 작업에 기한이 있습니다.</p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                'min-w-0 rounded-of border border-of-border bg-of-surface text-left hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
                density === 'compact' ? 'px-2 py-1.5' : 'px-3 py-2',
              )}
              onClick={() => onOpen(item)}
            >
              <span className="block truncate text-[11px] text-of-muted">{item.project_key} · {item.project_name}</span>
              <span className="block truncate text-xs font-medium text-of-text">{item.subject}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
