import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { DetailDrawer } from './DetailDrawer'
import { useWorkPackages } from './api'
import { buildCalendar, shiftMonth } from './calendar'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function currentMonth(): { year: number; month: number } {
  // UTC "now" for the initial month; day cells match WP dates by string, not Date.
  const now = new Date()
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }
}

export function CalendarPage() {
  const { projectId } = useParams() as { projectId: string }
  const [, setSearchParams] = useSearchParams()
  const [cursor, setCursor] = useState(currentMonth)
  const { data, isPending, isError, error, refetch } = useWorkPackages(projectId, {})

  const cal = useMemo(
    () => buildCalendar(cursor.year, cursor.month, data?.items ?? []),
    [cursor, data],
  )
  const todayIso = new Date().toISOString().slice(0, 10)

  const openDrawer = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('wp', id)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-of-border px-4 py-2">
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
                  'min-h-20 border-b border-r border-of-border p-1',
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

      <DetailDrawer projectId={projectId} />
    </div>
  )
}
