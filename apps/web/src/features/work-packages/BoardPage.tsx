import { useParams, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { useProjectStatuses } from '@/features/project-statuses/api'

import { DetailDrawer } from './DetailDrawer'
import { PriorityChip, TypeChip } from './chips'
import { useWorkPackages } from './api'
import { STATUS_LABELS, WP_STATUSES, type WorkPackage } from './types'

/* Static status columns — drag & drop is an explicit follow-up (PLAN Non-goals).
   Status changes happen in the detail drawer. */
export function BoardPage() {
  const { projectId } = useParams() as { projectId: string }
  const [, setSearchParams] = useSearchParams()
  const { data, isPending, isError, error, refetch } = useWorkPackages(projectId, {})
  const statuses = useProjectStatuses(projectId)

  // Columns come from the project's configured workflow (label + order); until it
  // loads (or if it is empty) fall back to the built-in status set so the board
  // always renders. Keys are the fixed WP_STATUSES either way.
  const columns =
    statuses.data && statuses.data.items.length > 0
      ? [...statuses.data.items]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({ key: s.key, label: s.name }))
      : WP_STATUSES.map((key) => ({ key, label: STATUS_LABELS[key] }))

  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />
  if (data.total === 0)
    return <EmptyState title="작업이 없습니다" hint="목록 화면에서 새 작업을 만들어 보세요." />

  const byStatus = new Map<string, WorkPackage[]>()
  for (const wp of data.items) {
    const bucket = byStatus.get(wp.status) ?? []
    bucket.push(wp)
    byStatus.set(wp.status, bucket)
  }

  const openDrawer = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('wp', id)
      return next
    })
  }

  return (
    <div className="h-full overflow-x-auto p-4">
      <div className="flex h-full min-w-max gap-3">
        {columns.map((column) => {
          const items = byStatus.get(column.key) ?? []
          return (
            <section
              key={column.key}
              aria-label={`${column.label} 컬럼`}
              className="flex h-full w-64 shrink-0 flex-col rounded-of border border-of-border bg-of-surface-2/50"
            >
              <header className="flex items-center justify-between px-3 py-2 text-xs font-medium">
                <span>{column.label}</span>
                <span className="text-of-muted">{items.length}</span>
              </header>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {items.map((wp) => (
                  <button
                    key={wp.id}
                    type="button"
                    onClick={() => openDrawer(wp.id)}
                    className="w-full rounded-of border border-of-border bg-of-surface p-2.5 text-left shadow-sm hover:border-of-accent"
                  >
                    <p className="mb-1.5 line-clamp-2 text-[13px] font-medium">{wp.subject}</p>
                    <div className="flex items-center gap-2">
                      <TypeChip type={wp.type} />
                      <PriorityChip priority={wp.priority} />
                      {wp.due_date ? (
                        <span className="ml-auto text-[11px] text-of-muted">{wp.due_date}</span>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
      <DetailDrawer projectId={projectId} />
    </div>
  )
}
