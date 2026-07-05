import { CalendarRange } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { cn } from '@/lib/utils'

import { DetailDrawer } from './DetailDrawer'
import { useWorkPackages } from './api'
import { buildTimeline, monthLabel, pct, type TimelineBar } from './timeline'
import type { WpStatus } from './types'

const STATUS_BAR: Record<WpStatus, string> = {
  backlog: 'bg-gray-300',
  todo: 'bg-sky-400',
  in_progress: 'bg-amber-400',
  in_review: 'bg-violet-400',
  done: 'bg-emerald-400',
  cancelled: 'bg-gray-200',
}

const LABEL_COL = 220 // px

/* Lightweight, license-free schedule/timeline (PLAN §12: no GPL/AGPL Gantt lib).
   Read-only positioning from work package start/due dates; drag/resize/deps are
   a future enhancement. Clicking a bar opens the detail drawer. */
export function TimelinePage() {
  const { projectId } = useParams() as { projectId: string }
  const [, setSearchParams] = useSearchParams()
  const { data, isPending, isError, error, refetch } = useWorkPackages(projectId, {})

  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const model = buildTimeline(data.items)
  if (!model) {
    return (
      <EmptyState
        title="일정이 있는 작업이 없습니다"
        hint="작업에 시작일/기한을 지정하면 타임라인에 표시됩니다."
      />
    )
  }

  const openDrawer = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('wp', id)
      return next
    })
  }

  const barStyle = (b: TimelineBar) => {
    const left = pct(b.startIdx - model.rangeStart, model.totalDays)
    const width = Math.max(pct(b.endIdx - b.startIdx + 1, model.totalDays), 0.8)
    return { left: `${left}%`, width: `${width}%` }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="min-w-[900px]">
          {/* month header */}
          <div className="sticky top-0 z-10 flex border-b border-of-border bg-of-surface">
            <div className="shrink-0 border-r border-of-border px-3 py-2 text-xs font-medium text-of-muted" style={{ width: LABEL_COL }}>
              작업
            </div>
            <div className="relative h-8 flex-1">
              {model.monthMarks.map((idx) => (
                <div
                  key={idx}
                  className="absolute top-0 h-full border-l border-of-border pl-1 text-[11px] text-of-muted"
                  style={{ left: `${pct(idx - model.rangeStart, model.totalDays)}%` }}
                >
                  {monthLabel(idx)}
                </div>
              ))}
            </div>
          </div>

          {/* rows */}
          {model.bars.map((b) => (
            <div key={b.wp.id} className="flex items-center border-b border-of-border/60 hover:bg-of-surface-2/40">
              <button
                type="button"
                onClick={() => openDrawer(b.wp.id)}
                className="shrink-0 truncate border-r border-of-border px-3 py-2 text-left text-[13px] hover:text-of-accent"
                style={{ width: LABEL_COL }}
              >
                {b.wp.subject}
              </button>
              <div className="relative h-8 flex-1">
                {/* month gridlines */}
                {model.monthMarks.map((idx) => (
                  <div
                    key={idx}
                    className="absolute top-0 h-full border-l border-of-border/50"
                    style={{ left: `${pct(idx - model.rangeStart, model.totalDays)}%` }}
                    aria-hidden
                  />
                ))}
                <button
                  type="button"
                  onClick={() => openDrawer(b.wp.id)}
                  aria-label={`${b.wp.subject} 일정`}
                  title={`${b.wp.start_date ?? '?'} → ${b.wp.due_date ?? '?'}`}
                  className={cn(
                    'absolute top-1.5 h-5 rounded-sm shadow-sm ring-1 ring-black/5',
                    STATUS_BAR[b.wp.status],
                    b.point && 'rounded-full',
                  )}
                  style={barStyle(b)}
                />
              </div>
            </div>
          ))}

          {model.undated.length > 0 ? (
            <div className="flex items-start gap-2 px-3 py-3 text-xs text-of-muted">
              <CalendarRange size={13} className="mt-0.5 shrink-0" />
              <span>일정 미정 {model.undated.length}건: {model.undated.map((w) => w.subject).join(', ')}</span>
            </div>
          ) : null}
        </div>
      </div>

      <DetailDrawer projectId={projectId} />
    </div>
  )
}
