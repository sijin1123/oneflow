import {
  BarChart3,
  CalendarDays,
  ChartGantt,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  SquareKanban,
  Table2,
} from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { EmptyState, ErrorState } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useMemberNames } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProjectStatuses } from '@/features/project-statuses/api'

import { BoardCardActions, type BoardCardActionMessage } from './BoardCardActions'
import { DetailDrawer } from './DetailDrawer'
import { Filters } from './Filters'
import { NewWorkPackageInline } from './NewWorkPackageInline'
import { usePatchWorkPackage, useWorkPackages } from './api'
import { PriorityChip, TypeChip } from './chips'
import { buildLanes, parseLaneBy, type LaneBy } from './lanes'
import { STATUS_LABELS, WP_STATUSES, type WorkPackage, type WpStatus } from './types'
import { useTypeLabels } from './useTypeLabels'

const BOARD_FILTER_KEYS = [
  'status',
  'priority',
  'type',
  'assignee_id',
  'milestone_id',
  'customer_id',
  'cycle_id',
  'module_id',
  'q',
  'cf_field',
  'cf_op',
  'cf_value',
] as const

const PROJECT_VIEWS = [
  { label: '표', path: 'work-packages', icon: Table2 },
  { label: '보드', path: 'board', icon: SquareKanban },
  { label: '캘린더', path: 'calendar', icon: CalendarDays },
  { label: '타임라인', path: 'timeline', icon: ChartGantt },
] as const

export function BoardPage() {
  const { projectId } = useParams() as { projectId: string }
  const [searchParams, setSearchParams] = useSearchParams()
  const laneBy = parseLaneBy(searchParams.get('lane_by'))
  const query = searchParams.get('q') ?? ''
  const [queryDraft, setQueryDraft] = useState(query)
  const [filtersOpen, setFiltersOpen] = useState(() =>
    BOARD_FILTER_KEYS.some((key) => searchParams.has(key)),
  )
  const filters = {
    status: searchParams.get('status') ?? undefined,
    priority: searchParams.get('priority') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    assignee_id: searchParams.get('assignee_id') ?? undefined,
    milestone_id: searchParams.get('milestone_id') ?? undefined,
    customer_id: searchParams.get('customer_id') ?? undefined,
    cycle_id: searchParams.get('cycle_id') ?? undefined,
    module_id: searchParams.get('module_id') ?? undefined,
    q: query || undefined,
    cf_field: searchParams.get('cf_field') ?? undefined,
    cf_op: searchParams.get('cf_op') ?? undefined,
    cf_value: searchParams.get('cf_value') ?? undefined,
  }
  const workPackages = useWorkPackages(projectId, filters)
  const statuses = useProjectStatuses(projectId)
  const patch = usePatchWorkPackage(projectId)
  const canWrite = useCanWrite(projectId)
  const typeLabel = useTypeLabels(projectId)
  const memberName = useMemberNames(projectId)
  const [pendingMoves, setPendingMoves] = useState<Map<string, string>>(new Map())
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [cardActionMessage, setCardActionMessage] = useState<BoardCardActionMessage | null>(null)

  useEffect(() => {
    setQueryDraft(query)
  }, [query])

  useEffect(() => {
    const raw = searchParams.get('lane_by')
    if (raw === null || raw === 'assignee' || raw === 'priority') return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('lane_by')
      return next
    }, { replace: true })
  }, [searchParams, setSearchParams])

  const columns =
    statuses.data && statuses.data.items.length > 0
      ? [...statuses.data.items]
          .sort((a, b) => a.position - b.position)
          .map((status) => ({ key: status.key as WpStatus, label: status.name }))
      : WP_STATUSES.map((key) => ({ key, label: STATUS_LABELS[key] }))

  const setLaneBy = (value: LaneBy) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value === 'none') next.delete('lane_by')
      else next.set('lane_by', value)
      return next
    }, { replace: true })
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      const value = queryDraft.trim()
      if (value) next.set('q', value)
      else next.delete('q')
      return next
    }, { replace: true })
  }

  const clearFilters = () => {
    setQueryDraft('')
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      BOARD_FILTER_KEYS.forEach((key) => next.delete(key))
      return next
    }, { replace: true })
  }

  const openDrawer = (id: string, options: { move?: boolean } = {}) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('wp', id)
      if (options.move) next.set('move', '1')
      else next.delete('move')
      return next
    })
  }

  const openCreate = (status?: WpStatus) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('new', '1')
      if (status) next.set('new_status', status)
      else next.delete('new_status')
      next.delete('new_priority')
      return next
    })
  }

  const effectiveStatus = (workPackage: WorkPackage) =>
    pendingMoves.get(workPackage.id) ?? workPackage.status

  const drop = (statusKey: WpStatus, laneKey: string, event: React.DragEvent) => {
    event.preventDefault()
    setDropTarget(null)
    const workPackageId = event.dataTransfer.getData('text/oneflow-wp')
    const workPackage = workPackages.data?.items.find((item) => item.id === workPackageId)
    if (!workPackage) return

    const laneChanges: {
      assignee_id?: string | null
      priority?: WorkPackage['priority']
    } = {}
    if (laneBy === 'assignee') {
      const target = laneKey === 'unassigned' ? null : laneKey
      if ((workPackage.assignee_id ?? null) !== target) laneChanges.assignee_id = target
    } else if (laneBy === 'priority' && workPackage.priority !== laneKey) {
      laneChanges.priority = laneKey as WorkPackage['priority']
    }
    const statusChanged = workPackage.status !== statusKey
    if (!statusChanged && Object.keys(laneChanges).length === 0) return

    setMoveError(null)
    if (statusChanged) {
      setPendingMoves((current) => new Map(current).set(workPackageId, statusKey))
    }
    patch.mutate(
      {
        wpId: workPackageId,
        patch: {
          expected_version: workPackage.version,
          ...(statusChanged ? { status: statusKey } : {}),
          ...laneChanges,
        },
      },
      {
        onSettled: () =>
          setPendingMoves((current) => {
            const next = new Map(current)
            next.delete(workPackageId)
            return next
          }),
        onError: () =>
          setMoveError(`'${workPackage.subject}' 이동에 실패했습니다. 다시 시도하세요.`),
      },
    )
  }

  const items = workPackages.data?.items ?? []
  const lanes = buildLanes(items, laneBy, memberName)
  const activeFilterCount = BOARD_FILTER_KEYS.filter((key) => searchParams.has(key)).length
  const hasFilters = activeFilterCount > 0

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-of-surface">
      <h1 className="sr-only">프로젝트 보드</h1>
      <FrameContextActions>
        <section
          aria-label="프로젝트 보드 제어"
          className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5"
        >
          {workPackages.data ? (
            <span
              className="shrink-0 text-[11px] tabular-nums text-of-muted"
              aria-label={`전체 ${workPackages.data.total}개 작업`}
            >
              {workPackages.data.total}개
            </span>
          ) : null}
          <nav
            aria-label="프로젝트 작업 보기"
            className="flex h-7 items-center rounded-of border border-of-border bg-of-surface-2 p-0.5"
          >
            {PROJECT_VIEWS.map((view) => {
              const Icon = view.icon
              const active = view.path === 'board'
              return (
                <Link
                  key={view.path}
                  to={`/projects/${projectId}/${view.path}`}
                  aria-label={`${view.label} 보기`}
                  aria-current={active ? 'page' : undefined}
                  title={`${view.label} 보기`}
                  className={`flex h-6 w-7 items-center justify-center rounded-[4px] text-of-muted hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus ${
                    active ? 'bg-of-surface-selected text-of-accent' : ''
                  }`}
                >
                  <Icon size={13} aria-hidden="true" />
                </Link>
              )
            })}
          </nav>
          <Button
            variant="outline"
            size="sm"
            aria-expanded={filtersOpen}
            aria-controls="project-board-filters"
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <SlidersHorizontal size={13} /> 필터
            {activeFilterCount > 0 ? (
              <span className="tabular-nums">{activeFilterCount}</span>
            ) : null}
          </Button>
          <Select
            aria-label="스윔레인 기준"
            className="h-7 w-32 text-xs"
            value={laneBy}
            onChange={(event) => setLaneBy(event.target.value as LaneBy)}
          >
            <option value="none">스윔레인 없음</option>
            <option value="assignee">담당자별</option>
            <option value="priority">우선순위별</option>
          </Select>
          <Link
            to={`/projects/${projectId}/dashboard`}
            className="inline-flex h-7 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium text-of-text hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            <BarChart3 size={13} aria-hidden="true" /> 분석
          </Link>
          {canWrite ? (
            <Button size="sm" onClick={() => openCreate()}>
              <Plus size={13} /> 새 작업
            </Button>
          ) : null}
        </section>
      </FrameContextActions>

      {filtersOpen ? (
        <div
          id="project-board-filters"
          className="animate-in border-b border-of-border bg-of-surface px-4 py-2.5 fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none"
        >
          <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center">
            <form onSubmit={submitSearch} className="flex min-w-[220px] flex-1 gap-2 sm:max-w-sm">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
                  aria-hidden="true"
                />
                <Input
                  value={queryDraft}
                  onChange={(event) => setQueryDraft(event.target.value)}
                  placeholder="작업 검색"
                  aria-label="프로젝트 보드 검색어"
                  className="h-7 pl-8 text-xs"
                />
              </div>
              <Button type="submit" size="sm" variant="outline">
                <Search size={13} /> 검색
              </Button>
            </form>
            <div className="min-w-0 flex-1">
              <Filters projectId={projectId} />
            </div>
            {hasFilters ? (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <RotateCcw size={13} /> 초기화
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <NewWorkPackageInline projectId={projectId} canWrite={canWrite} />

      {!canWrite ? <ReadOnlyNotice className="mx-4 mt-2" /> : null}
      {moveError || cardActionMessage ? (
        <div
          role={moveError || cardActionMessage?.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`border-b border-of-border px-4 py-2 text-xs ${
            moveError || cardActionMessage?.kind === 'error'
              ? 'bg-of-danger/10 text-of-danger'
              : 'bg-of-surface-2/60 text-of-muted'
          }`}
        >
          {moveError ?? cardActionMessage?.text}
        </div>
      ) : null}

      <section
        aria-label="프로젝트 작업 보드"
        aria-busy={workPackages.isPending}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {workPackages.isPending ? (
          <BoardSkeleton columns={columns.map((column) => column.label)} />
        ) : workPackages.isError ? (
          <BoardStateFrame columns={columns.map((column) => column.label)}>
            <ErrorState error={workPackages.error} onRetry={() => workPackages.refetch()} />
          </BoardStateFrame>
        ) : workPackages.data.total === 0 && hasFilters ? (
          <BoardStateFrame columns={columns.map((column) => column.label)}>
            <EmptyState
              title="조건에 맞는 작업이 없습니다"
              hint="검색이나 필터를 조정해 다른 작업을 찾아보세요."
            >
              <Button size="sm" variant="outline" onClick={clearFilters}>
                <RotateCcw size={13} /> 현재 보기 초기화
              </Button>
            </EmptyState>
          </BoardStateFrame>
        ) : workPackages.data.total === 0 ? (
          <BoardStateFrame columns={columns.map((column) => column.label)}>
            <EmptyState
              title="아직 작업이 없습니다"
              hint={
                canWrite
                  ? '첫 작업을 만들어 보드 흐름을 시작하세요.'
                  : '프로젝트 멤버가 작업을 추가하면 상태별로 표시됩니다.'
              }
            >
              {canWrite ? (
                <Button size="sm" onClick={() => openCreate()}>
                  <Plus size={13} /> 첫 작업 만들기
                </Button>
              ) : null}
            </EmptyState>
          </BoardStateFrame>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto bg-of-surface-2/30 p-3">
            {lanes.map((lane) => {
              const byStatus = new Map<string, WorkPackage[]>()
              for (const workPackage of lane.items) {
                const status = effectiveStatus(workPackage)
                const bucket = byStatus.get(status) ?? []
                bucket.push(workPackage)
                byStatus.set(status, bucket)
              }
              return (
                <section
                  key={lane.key}
                  aria-label={lane.label ? `${lane.label} 스윔레인` : '전체 작업 스윔레인'}
                  className="mb-5 min-w-max last:mb-0"
                  data-testid="board-lane"
                >
                  {lane.label ? (
                    <header className="sticky left-0 mb-2 flex w-fit items-center gap-2 px-1">
                      <span className="text-xs font-semibold text-of-text">{lane.label}</span>
                      <Badge variant="outline">{lane.items.length}</Badge>
                    </header>
                  ) : null}
                  <div className="flex min-w-max items-stretch gap-3">
                    {columns.map((column) => {
                      const columnItems = byStatus.get(column.key) ?? []
                      const targetKey = `${lane.key}:${column.key}`
                      return (
                        <section
                          key={column.key}
                          aria-label={`${lane.label ? `${lane.label} ` : ''}${column.label} 컬럼`}
                          onDragOver={
                            canWrite
                              ? (event) => {
                                  event.preventDefault()
                                  setDropTarget(targetKey)
                                }
                              : undefined
                          }
                          onDragLeave={
                            canWrite
                              ? () =>
                                  setDropTarget((current) =>
                                    current === targetKey ? null : current,
                                  )
                              : undefined
                          }
                          onDrop={
                            canWrite
                              ? (event) => drop(column.key, lane.key, event)
                              : undefined
                          }
                          className={`flex w-72 shrink-0 flex-col border-t-2 bg-of-surface-2/45 transition-colors ${
                            dropTarget === targetKey
                              ? 'border-of-accent bg-of-accent-soft/60'
                              : 'border-of-border-strong'
                          }`}
                        >
                          <header className="flex h-9 items-center gap-2 border-b border-of-border px-2">
                            <span className="h-2 w-2 rounded-full bg-of-muted" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-xs font-medium">
                              {column.label}
                            </span>
                            <Badge variant="outline">{columnItems.length}</Badge>
                            {canWrite ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                aria-label={`${column.label}에 새 작업`}
                                title={`${column.label}에 새 작업`}
                                onClick={() => openCreate(column.key)}
                              >
                                <Plus size={13} />
                              </Button>
                            ) : null}
                          </header>
                          <div className="min-h-20 flex-1 space-y-2 p-2">
                            {columnItems.map((workPackage) => (
                              <article
                                key={workPackage.id}
                                className={`group rounded-of border border-of-border bg-of-surface p-2.5 shadow-sm transition-colors hover:border-of-accent focus-within:border-of-accent ${
                                  pendingMoves.has(workPackage.id) ? 'opacity-60' : ''
                                }`}
                              >
                                <div className="flex min-w-0 items-start gap-2">
                                  <button
                                    type="button"
                                    draggable={canWrite && !pendingMoves.has(workPackage.id)}
                                    aria-busy={pendingMoves.has(workPackage.id)}
                                    aria-label={`${workPackage.subject} 작업 열기`}
                                    onDragStart={
                                      canWrite
                                        ? (event) => {
                                            event.dataTransfer.setData(
                                              'text/oneflow-wp',
                                              workPackage.id,
                                            )
                                            event.dataTransfer.effectAllowed = 'move'
                                          }
                                        : undefined
                                    }
                                    onClick={() => openDrawer(workPackage.id)}
                                    className={`min-w-0 flex-1 text-left ${
                                      canWrite
                                        ? 'cursor-grab active:cursor-grabbing'
                                        : 'cursor-pointer'
                                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus`}
                                  >
                                    <span className="mb-2 block line-clamp-2 text-[13px] font-medium leading-5">
                                      {workPackage.subject}
                                    </span>
                                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                                      <TypeChip
                                        type={workPackage.type}
                                        label={typeLabel(workPackage.type)}
                                      />
                                      <PriorityChip priority={workPackage.priority} />
                                      {workPackage.assignee_id ? (
                                        <span className="max-w-24 truncate text-[11px] text-of-muted">
                                          {memberName(workPackage.assignee_id)}
                                        </span>
                                      ) : null}
                                      {workPackage.due_date ? (
                                        <span className="ml-auto text-[11px] tabular-nums text-of-muted">
                                          {workPackage.due_date}
                                        </span>
                                      ) : null}
                                    </span>
                                  </button>
                                  <BoardCardActions
                                    projectId={projectId}
                                    wp={workPackage}
                                    canWrite={canWrite}
                                    onOpenDrawer={(id) => openDrawer(id)}
                                    onOpenMove={(id) => openDrawer(id, { move: true })}
                                    onMessage={setCardActionMessage}
                                  />
                                </div>
                              </article>
                            ))}
                            {columnItems.length === 0 ? (
                              <p className="px-2 py-5 text-center text-[11px] text-of-muted">
                                작업 없음
                              </p>
                            ) : null}
                          </div>
                        </section>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </section>
      <DetailDrawer projectId={projectId} />
    </div>
  )
}

function BoardSkeleton({ columns }: { columns: string[] }) {
  const visibleColumns = columns.length > 0 ? columns : ['백로그', '할 일', '진행 중', '완료']
  return (
    <div
      role="status"
      aria-label="프로젝트 보드 불러오는 중"
      className="min-h-0 flex-1 overflow-hidden bg-of-surface-2/30 p-3"
    >
      <div className="flex min-w-max gap-3">
        {visibleColumns.map((column, columnIndex) => (
          <section
            key={column}
            aria-label={`${column} 컬럼 불러오는 중`}
            className="w-72 shrink-0 border-t-2 border-of-border-strong bg-of-surface-2/45"
          >
            <div className="flex h-9 items-center gap-2 border-b border-of-border px-2">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="ml-auto h-4 w-6" />
            </div>
            <div className="space-y-2 p-2">
              {Array.from({ length: columnIndex < 2 ? 2 : 1 }, (_, cardIndex) => (
                <div
                  key={cardIndex}
                  className="space-y-3 rounded-of border border-of-border bg-of-surface p-3"
                >
                  <Skeleton className="h-3 w-4/5" />
                  <div className="flex gap-2">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-14" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function BoardStateFrame({
  columns,
  children,
}: {
  columns: string[]
  children: React.ReactNode
}) {
  const visibleColumns = columns.length > 0 ? columns : ['백로그', '할 일', '진행 중', '완료']
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-of-surface-2/30 p-3">
      <div className="flex min-w-max gap-3 opacity-55" aria-hidden="true">
        {visibleColumns.map((column) => (
          <section
            key={column}
            className="h-52 w-72 shrink-0 border-t-2 border-of-border-strong bg-of-surface-2/45"
          >
            <div className="flex h-9 items-center gap-2 border-b border-of-border px-2">
              <span className="h-2 w-2 rounded-full bg-of-muted" />
              <span className="text-xs font-medium">{column}</span>
              <span className="ml-auto rounded-of border border-of-border px-1.5 text-[10px]">0</span>
            </div>
          </section>
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-of-surface/60 p-4">
        {children}
      </div>
    </div>
  )
}
