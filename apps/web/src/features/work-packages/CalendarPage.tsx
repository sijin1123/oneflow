import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { PlanningSurface } from '@/features/planning/PlanningSurface'
import { localYearMonth, todayISO } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import { DetailDrawer } from './DetailDrawer'
import { useWorkPackages } from './api'
import { buildCalendar, shiftMonth } from './calendar'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// Local "now": day cells match WP dates by string, so the highlighted "today" and
// the initial month must use the viewer's local date, not UTC.
const currentMonth = () => localYearMonth()

export function CalendarPage() {
  const { projectId } = useParams() as { projectId: string }
  const [, setSearchParams] = useSearchParams()
  const [cursor, setCursor] = useState(currentMonth)
  const { data, isPending, isError, error, refetch } = useWorkPackages(projectId, {})

  const cal = useMemo(
    () => buildCalendar(cursor.year, cursor.month, data?.items ?? []),
    [cursor, data],
  )
  const todayIso = todayISO()
  const items = data?.items ?? []
  const scheduledItems = items.filter((wp) => wp.due_date !== null)
  const monthItemCount = cal.weeks.flat().reduce((total, cell) => total + cell.items.length, 0)
  const description =
    '기한이 있는 작업을 월 단위로 훑고, 일정 충돌이나 비어 있는 마감 구간을 빠르게 확인합니다.'

  const openDrawer = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('wp', id)
      return next
    })
  }

  return (
    <PlanningSurface
      projectId={projectId}
      active="calendar"
      title="캘린더"
      description={description}
      bodyClassName="flex min-h-0 flex-col"
      metrics={[
        { label: '작업', value: data?.total ?? '-', hint: '현재 프로젝트' },
        { label: '일정 있음', value: isPending || isError ? '-' : scheduledItems.length, hint: '기한 기준' },
        {
          label: '현재 월',
          value: `${cursor.year}년 ${String(cursor.month).padStart(2, '0')}월`,
          hint: `${monthItemCount}건 표시`,
        },
        { label: '오늘', value: todayIso.slice(5), hint: '로컬 날짜' },
      ]}
    >
      <div className="flex min-h-[560px] flex-1 flex-col overflow-hidden rounded-of border border-of-border bg-of-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-of-border px-3 py-2">
          <span className="text-sm font-medium tabular-nums">
            {cursor.year}.{String(cursor.month).padStart(2, '0')}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="이전 달"
              onClick={() => setCursor((c) => shiftMonth(c.year, c.month, -1))}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(currentMonth())}>
              이번 달
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="다음 달"
              onClick={() => setCursor((c) => shiftMonth(c.year, c.month, 1))}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>

        {isPending ? (
          <ListSkeleton />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col p-2">
            <div className="grid grid-cols-7 border-b border-of-border text-center text-[11px] font-medium text-of-muted">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid flex-1 auto-rows-fr grid-cols-7">
              {cal.weeks.flat().map((cell) => (
                <div
                  key={cell.iso}
                  className={cn(
                    'min-h-20 min-w-0 border-b border-r border-of-border p-1',
                    !cell.inMonth && 'bg-of-surface-2/40',
                  )}
                >
                  <div
                    className={cn(
                      'mb-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px]',
                      cell.inMonth ? 'text-of-text' : 'text-of-muted',
                      cell.iso === todayIso && 'bg-of-accent font-semibold text-white',
                    )}
                  >
                    {cell.day}
                  </div>
                  <div className="space-y-0.5">
                    {cell.items.map((wp) => (
                      <button
                        key={wp.id}
                        type="button"
                        title={wp.subject}
                        onClick={() => openDrawer(wp.id)}
                        className="block w-full truncate rounded-of bg-of-accent-soft px-1 py-0.5 text-left text-[11px] text-of-accent hover:opacity-80"
                      >
                        {wp.subject}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DetailDrawer projectId={projectId} />
    </PlanningSurface>
  )
}
