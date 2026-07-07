import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Select } from '@/components/ui/select'
import { useMemberNames } from '@/features/members/api'
import { useProjectStatuses } from '@/features/project-statuses/api'

import { DetailDrawer } from './DetailDrawer'
import { PriorityChip, TypeChip } from './chips'
import { usePatchWorkPackage, useWorkPackages } from './api'
import { buildLanes, type LaneBy } from './lanes'
import { useTypeLabels } from './useTypeLabels'
import { STATUS_LABELS, WP_STATUSES, type WorkPackage, type WpStatus } from './types'

/* Kanban board with native HTML5 drag & drop (Pass 3 PR-K, no library).
   A drop optimistically moves the card via a local pending-move overlay; the
   PATCH carries the optimistic-concurrency token and any failure (409 etc.)
   snaps the card back to the server state. Keyboard users keep the fully
   accessible path: open the drawer and change the status select. */
export function BoardPage() {
  const { projectId } = useParams() as { projectId: string }
  const [, setSearchParams] = useSearchParams()
  const { data, isPending, isError, error, refetch } = useWorkPackages(projectId, {})
  const statuses = useProjectStatuses(projectId)
  const patch = usePatchWorkPackage(projectId)
  const typeLabel = useTypeLabels(projectId)
  const memberName = useMemberNames(projectId)
  const [laneBy, setLaneBy] = useState<LaneBy>('none')

  // wp.id → optimistic target status while its PATCH is in flight.
  const [pendingMoves, setPendingMoves] = useState<Map<string, string>>(new Map())
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)

  // Columns come from the project's configured workflow (label + order); until it
  // loads (or if it is empty) fall back to the built-in status set so the board
  // always renders. Keys are the fixed WP_STATUSES either way.
  const columns =
    statuses.data && statuses.data.items.length > 0
      ? [...statuses.data.items]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({ key: s.key as WpStatus, label: s.name }))
      : WP_STATUSES.map((key) => ({ key, label: STATUS_LABELS[key] }))

  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />
  if (data.total === 0)
    return <EmptyState title="작업이 없습니다" hint="목록 화면에서 새 작업을 만들어 보세요." />

  const lanes = buildLanes(data.items, laneBy, memberName)

  const effectiveStatus = (wp: WorkPackage) => pendingMoves.get(wp.id) ?? wp.status

  const openDrawer = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('wp', id)
      return next
    })
  }

  const drop = (statusKey: WpStatus, laneKey: string, e: React.DragEvent) => {
    e.preventDefault()
    setDropTarget(null)
    const wpId = e.dataTransfer.getData('text/oneflow-wp')
    const wp = data.items.find((i) => i.id === wpId)
    if (!wp) return
    // Cross-lane drop also updates the LANE field (Pass 31 — same PATCH,
    // same version-token contract; the unassigned lane clears the assignee).
    const laneChanges: { assignee_id?: string | null; priority?: WorkPackage['priority'] } = {}
    if (laneBy === 'assignee') {
      const target = laneKey === 'unassigned' ? null : laneKey
      if ((wp.assignee_id ?? null) !== target) laneChanges.assignee_id = target
    } else if (laneBy === 'priority' && wp.priority !== laneKey) {
      laneChanges.priority = laneKey as WorkPackage['priority']
    }
    const statusChanged = wp.status !== statusKey
    if (!statusChanged && Object.keys(laneChanges).length === 0) return
    setMoveError(null)
    if (statusChanged) setPendingMoves((prev) => new Map(prev).set(wpId, statusKey))
    patch.mutate(
      {
        wpId,
        patch: {
          expected_version: wp.version,
          ...(statusChanged ? { status: statusKey } : {}),
          ...laneChanges,
        },
      },
      {
        onSettled: () =>
          // Success refetches the list with the new status; failure snaps back.
          setPendingMoves((prev) => {
            const next = new Map(prev)
            next.delete(wpId)
            return next
          }),
        onError: () => setMoveError(`'${wp.subject}' 이동에 실패했습니다. 다시 시도하세요.`),
      },
    )
  }

  return (
    <div className="h-full overflow-x-auto p-4">
      <div className="mb-2 flex items-center gap-2">
        <Select
          aria-label="스윔레인 기준"
          className="h-7 w-32 text-xs"
          value={laneBy}
          onChange={(e) => setLaneBy(e.target.value as LaneBy)}
        >
          <option value="none">스윔레인 없음</option>
          <option value="assignee">담당자별</option>
          <option value="priority">우선순위별</option>
        </Select>
        {moveError ? (
          <p role="alert" aria-live="polite" className="text-xs text-of-danger">
            {moveError}
          </p>
        ) : null}
      </div>
      {lanes.map((lane) => {
        const byStatus = new Map<string, WorkPackage[]>()
        for (const wp of lane.items) {
          const bucket = byStatus.get(effectiveStatus(wp)) ?? []
          bucket.push(wp)
          byStatus.set(effectiveStatus(wp), bucket)
        }
        return (
      <div key={lane.key} className="mb-4" data-testid="board-lane">
      {lane.label ? (
        <p className="mb-1.5 text-xs font-semibold text-of-muted">
          {lane.label} <span className="font-normal">({lane.items.length})</span>
        </p>
      ) : null}
      <div className="flex min-w-max gap-3">
        {columns.map((column) => {
          const items = byStatus.get(column.key) ?? []
          const targetKey = `${lane.key}:${column.key}`
          return (
            <section
              key={column.key}
              aria-label={`${lane.label ? `${lane.label} ` : ''}${column.label} 컬럼`}
              onDragOver={(e) => {
                e.preventDefault()
                setDropTarget(targetKey)
              }}
              onDragLeave={() => setDropTarget((t) => (t === targetKey ? null : t))}
              onDrop={(e) => drop(column.key, lane.key, e)}
              className={`flex max-h-full w-64 shrink-0 flex-col rounded-of border bg-of-surface-2/50 ${
                dropTarget === targetKey ? 'border-of-accent' : 'border-of-border'
              }`}
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
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/oneflow-wp', wp.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onClick={() => openDrawer(wp.id)}
                    className={`w-full cursor-grab rounded-of border border-of-border bg-of-surface p-2.5 text-left shadow-sm hover:border-of-accent active:cursor-grabbing ${
                      pendingMoves.has(wp.id) ? 'opacity-60' : ''
                    }`}
                  >
                    <p className="mb-1.5 line-clamp-2 text-[13px] font-medium">{wp.subject}</p>
                    <div className="flex items-center gap-2">
                      <TypeChip type={wp.type} label={typeLabel(wp.type)} />
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
      </div>
        )
      })}
      <DetailDrawer projectId={projectId} />
    </div>
  )
}
