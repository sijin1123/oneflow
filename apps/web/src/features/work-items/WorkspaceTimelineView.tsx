import { Badge } from '@/components/ui/badge'
import type { GridDensity } from '@/components/ui/data-grid'
import type { SearchResultItem } from '@/features/search/api'
import { cn } from '@/lib/utils'

import { buildWorkspaceTimeline } from './workspaceViews'

export function WorkspaceTimelineView({
  items,
  density,
  total,
  rangeLabel,
  onOpen,
}: {
  items: SearchResultItem[]
  density: GridDensity
  total: number
  rangeLabel: string
  onOpen: (item: SearchResultItem) => void
}) {
  const timeline = buildWorkspaceTimeline(items)
  const pixelsPerDay = timeline.spanDays <= 31 ? 28 : timeline.spanDays <= 120 ? 12 : 6
  const contentWidth = Math.max(820, 224 + Math.min(6000, timeline.spanDays * pixelsPerDay))

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="전체 작업 Timeline" data-density={density}>
      <header className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-y border-of-border px-3 py-1.5 text-xs">
        <strong>일정 {timeline.rows.length}건</strong>
        <Badge variant="neutral">일정 미정 {timeline.undated.length}</Badge>
        {timeline.start && timeline.end ? (
          <span className="text-of-muted">{timeline.start} - {timeline.end}</span>
        ) : null}
        {total > items.length ? <span className="ml-auto text-of-muted">{rangeLabel} 기준</span> : null}
      </header>

      <div className="of-scrollbar min-h-0 flex-1 overflow-auto">
        <div style={{ minWidth: `${contentWidth}px` }} className="min-h-full">
          {timeline.rows.length > 0 ? (
            <>
              <div className="sticky top-0 z-20 flex h-9 border-b border-of-border bg-of-surface">
                <div className="sticky left-0 z-30 flex w-56 shrink-0 items-center border-r border-of-border bg-of-surface px-3 text-[11px] font-medium text-of-muted">
                  작업
                </div>
                <div className="relative min-w-0 flex-1 overflow-hidden">
                  {timeline.markers.map((marker) => (
                    <span
                      key={marker.iso}
                      className="absolute inset-y-0 border-l border-of-border-subtle pl-1 pt-2 text-[10px] text-of-muted"
                      style={{ left: `${marker.leftPercent}%` }}
                    >
                      {marker.label}
                    </span>
                  ))}
                </div>
              </div>

              {timeline.rows.map((row) => (
                <div
                  key={row.item.id}
                  className={cn(
                    'group flex border-b border-of-border-subtle hover:bg-of-surface-hover',
                    density === 'compact' ? 'h-10' : 'h-12',
                  )}
                >
                  <button
                    type="button"
                    className="sticky left-0 z-10 flex w-56 shrink-0 min-w-0 items-center gap-2 border-r border-of-border bg-of-surface px-3 text-left group-hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus"
                    onClick={() => onOpen(row.item)}
                  >
                    <Badge variant="neutral" className="shrink-0 font-mono">{row.item.project_key}</Badge>
                    <span className="min-w-0 truncate text-xs font-medium">{row.item.subject}</span>
                  </button>
                  <div className="relative min-w-0 flex-1 bg-[linear-gradient(to_right,var(--of-border-subtle)_1px,transparent_1px)] bg-[length:7%_100%]">
                    <button
                      type="button"
                      aria-label={`${row.item.subject} 일정 막대`}
                      title={`${row.start} - ${row.end}`}
                      className={cn(
                        'absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded-[4px] px-2 text-left text-[10px] font-medium text-white shadow-[var(--of-shadow-xs)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
                        statusColor(row.item.status),
                      )}
                      style={{ left: `${row.leftPercent}%`, width: `${row.widthPercent}%` }}
                      onClick={() => onOpen(row.item)}
                    >
                      <span className="block truncate">{row.item.subject}</span>
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="flex min-h-44 items-center justify-center border-b border-of-border px-4 text-center text-sm text-of-muted">
              시작일이나 기한이 있는 작업이 없습니다.
            </div>
          )}

          <section className="p-3" aria-label="일정 미정 작업">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium">
              일정 미정 <Badge variant="neutral">{timeline.undated.length}</Badge>
            </div>
            {timeline.undated.length === 0 ? (
              <p className="text-xs text-of-muted">현재 페이지의 모든 작업에 일정이 있습니다.</p>
            ) : (
              <div className="grid max-w-5xl gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {timeline.undated.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="min-w-0 rounded-of border border-of-border bg-of-surface px-3 py-2 text-left hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                    onClick={() => onOpen(item)}
                  >
                    <span className="block truncate text-[11px] text-of-muted">{item.project_key} · {item.project_name}</span>
                    <span className="block truncate text-xs font-medium">{item.subject}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  )
}

function statusColor(status: SearchResultItem['status']) {
  if (status === 'done') return 'bg-of-success'
  if (status === 'cancelled') return 'bg-of-muted'
  if (status === 'in_progress' || status === 'in_review') return 'bg-of-warning'
  return 'bg-of-accent'
}
