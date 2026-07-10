import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Select } from '@/components/ui/select'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { useMemberNames } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { PlanningSurface } from '@/features/planning/PlanningSurface'
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
  const canWrite = useCanWrite(projectId)
  const typeLabel = useTypeLabels(projectId)
  const memberName = useMemberNames(projectId)
  const [laneBy, setLaneBy] = useState<LaneBy>('none')
  const description =
    '작업 흐름을 상태 컬럼으로 보고, 필요하면 담당자나 우선순위 스윔레인으로 계획 밀도를 조정합니다.'

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

  if (isPending) {
    return (
      <PlanningSurface projectId={projectId} active="board" title="보드" description={description} wide>
        <ListSkeleton />
      </PlanningSurface>
    )
  }
  if (isError) {
    return (
      <PlanningSurface projectId={projectId} active="board" title="보드" description={description} wide>
        <ErrorState error={error} onRetry={() => refetch()} />
      </PlanningSurface>
    )
  }
  if (data.total === 0) {
    return (
      <PlanningSurface projectId={projectId} active="board" title="보드" description={description} wide>
        <EmptyState
          title="작업이 없습니다"
          hint="목록 화면에서 새 작업을 만들어 보세요."
          className="rounded-of border border-of-border bg-of-surface"
        />
      </PlanningSurface>
    )
  }

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
    <PlanningSurface
      projectId={projectId}
      active="board"
      title="보드"
      description={description}
      wide
      bodyClassName="flex min-h-0 flex-col"
      metrics={[
        { label: '작업', value: data.total, hint: '현재 보드 범위' },
        { label: '컬럼', value: columns.length, hint: '프로젝트 워크플로우' },
        {
          label: '스윔레인',
          value: laneBy === 'none' ? '없음' : laneBy === 'assignee' ? '담당자' : '우선순위',
          hint: `${lanes.length}개 묶음`,
        },
        {
          label: '진행 중',
          value: data.items.filter((wp) => effectiveStatus(wp) === 'in_progress').length,
          hint: '이동 대기 포함',
        },
      ]}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-of border border-of-border bg-of-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-of-border px-3 py-2">
          {!canWrite ? <ReadOnlyNotice className="w-full" /> : null}
          <Select
            aria-label="스윔레인 기준"
            className="h-7 w-36 text-xs"
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
        <div className="min-h-0 flex-1 overflow-x-auto p-3">
          {lanes.map((lane) => {
            const byStatus = new Map<string, WorkPackage[]>()
            for (const wp of lane.items) {
              const bucket = byStatus.get(effectiveStatus(wp)) ?? []
              bucket.push(wp)
              byStatus.set(effectiveStatus(wp), bucket)
            }
            return (
              <div key={lane.key} className="mb-4 last:mb-0" data-testid="board-lane">
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
                        onDragOver={
                          canWrite
                            ? (e) => {
                                e.preventDefault()
                                setDropTarget(targetKey)
                              }
                            : undefined
                        }
                        onDragLeave={
                          canWrite
                            ? () => setDropTarget((t) => (t === targetKey ? null : t))
                            : undefined
                        }
                        onDrop={canWrite ? (e) => drop(column.key, lane.key, e) : undefined}
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
                              draggable={canWrite}
                              onDragStart={
                                canWrite
                                  ? (e) => {
                                      e.dataTransfer.setData('text/oneflow-wp', wp.id)
                                      e.dataTransfer.effectAllowed = 'move'
                                    }
                                  : undefined
                              }
                              onClick={() => openDrawer(wp.id)}
                              className={`w-full rounded-of border border-of-border bg-of-surface p-2.5 text-left shadow-sm hover:border-of-accent ${
                                canWrite ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                              } ${pendingMoves.has(wp.id) ? 'opacity-60' : ''}`}
                            >
                              <p className="mb-1.5 line-clamp-2 text-[13px] font-medium">
                                {wp.subject}
                              </p>
                              <div className="flex items-center gap-2">
                                <TypeChip type={wp.type} label={typeLabel(wp.type)} />
                                <PriorityChip priority={wp.priority} />
                                {wp.due_date ? (
                                  <span className="ml-auto text-[11px] text-of-muted">
                                    {wp.due_date}
                                  </span>
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
        </div>
      </div>
      <DetailDrawer projectId={projectId} />
    </PlanningSurface>
  )
}
