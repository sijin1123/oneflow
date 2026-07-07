import { CalendarRange, Flag } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { useMilestones } from '@/features/milestones/api'
import { todayISO } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import { DetailDrawer } from './DetailDrawer'
import { useProjectRelations, useWorkPackages } from './api'
import { buildConnectors, buildTimeline, dayIndex, monthLabel, pct, type TimelineBar } from './timeline'
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
  const milestones = useMilestones(projectId)
  const relations = useProjectRelations(projectId)

  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const dated = (milestones.data?.items ?? [])
    .map((m) => ({ ...m, idx: dayIndex(m.due_date) }))
    .filter((m): m is typeof m & { idx: number } => m.idx !== null)
  const todayIdx = dayIndex(todayISO())
  // Keep today + milestone markers inside the visible range so nothing is clipped.
  const extraDays = [...dated.map((m) => m.idx), ...(todayIdx !== null ? [todayIdx] : [])]

  const model = buildTimeline(data.items, extraDays)
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

  // Row height is 32px (h-8); connector y = row*32 + 16 (bar centerline).
  const { connectors, omittedMissingSchedule } = buildConnectors(
    model.bars,
    relations.data?.items ?? [],
  )
  const xPct = (day: number) => `${pct(day - model.rangeStart, model.totalDays)}%`

  const barStyle = (b: TimelineBar) => {
    const left = pct(b.startIdx - model.rangeStart, model.totalDays)
    const width = Math.max(pct(b.endIdx - b.startIdx + 1, model.totalDays), 0.8)
    return { left: `${left}%`, width: `${width}%` }
  }

  const inRange = (idx: number) => idx >= model.rangeStart && idx <= model.rangeEnd
  const posLeft = (idx: number) => `${pct(idx - model.rangeStart, model.totalDays)}%`
  const todayLeft = todayIdx !== null && inRange(todayIdx) ? posLeft(todayIdx) : null
  const visibleMilestones = dated.filter((m) => inRange(m.idx))

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
              {/* milestone markers (diamonds) at their due dates */}
              {visibleMilestones.map((m) => (
                <div
                  key={m.id}
                  className="absolute top-1.5 -translate-x-1/2 text-of-accent"
                  style={{ left: posLeft(m.idx) }}
                  title={`마일스톤: ${m.name} (${m.due_date})`}
                  aria-label={`마일스톤 ${m.name} ${m.due_date}`}
                >
                  <Flag size={13} fill="currentColor" />
                </div>
              ))}
              {todayLeft ? (
                <div
                  className="absolute top-0 h-full border-l-2 border-of-danger"
                  style={{ left: todayLeft }}
                  title="오늘"
                  aria-label="오늘"
                />
              ) : null}
            </div>
          </div>

          {/* rows + dependency connector overlay (percent x / px y — the
              overlay lives in the same scroll content as the bars) */}
          <div className="relative">
            <svg
              aria-label="의존 연결선"
              className="pointer-events-none absolute top-0 z-10 h-full"
              style={{ left: LABEL_COL, width: `calc(100% - ${LABEL_COL}px)` }}
            >
              <defs>
                <marker
                  id="dep-arrow"
                  markerWidth="6"
                  markerHeight="6"
                  refX="5"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L6,3 L0,6 z" className="fill-of-muted" />
                </marker>
              </defs>
              {connectors.map((c) => {
                const y1 = c.fromRow * 32 + 16
                const y2 = c.toRow * 32 + 16
                const x1 = xPct(c.fromDay)
                const x2 = xPct(c.toDay)
                const xm = `${(pct(c.fromDay - model.rangeStart, model.totalDays) + pct(c.toDay - model.rangeStart, model.totalDays)) / 2}%`
                const cls = c.type === 'blocks' ? 'stroke-of-danger/70' : 'stroke-of-muted'
                return (
                  <g key={c.id} data-testid="dep-connector">
                    <line x1={x1} y1={y1} x2={xm} y2={y1} className={cls} strokeWidth="1.5" />
                    <line x1={xm} y1={y1} x2={xm} y2={y2} className={cls} strokeWidth="1.5" />
                    <line
                      x1={xm}
                      y1={y2}
                      x2={x2}
                      y2={y2}
                      className={cls}
                      strokeWidth="1.5"
                      markerEnd="url(#dep-arrow)"
                    />
                  </g>
                )
              })}
            </svg>
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
                {/* today line spans every row for a continuous marker */}
                {todayLeft ? (
                  <div
                    className="absolute top-0 h-full border-l-2 border-of-danger/70"
                    style={{ left: todayLeft }}
                    aria-hidden
                  />
                ) : null}
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

          </div>

          {omittedMissingSchedule > 0 ? (
            <p className="px-3 py-1.5 text-[11px] text-of-muted">
              일정 미정으로 표시되지 않은 의존 {omittedMissingSchedule}건 (연관(relates)은 의존이
              아니라 표시하지 않습니다)
            </p>
          ) : null}

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
