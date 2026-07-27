import {
  BarChart3,
  CalendarDays,
  ChartGantt,
  ClipboardList,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  SquareKanban,
  Table2,
  X,
} from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { EmptyState, ErrorState } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useCycles } from '@/features/cycles/api'
import { useMemberNames, useMembers } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProjectTypeOptions } from '@/features/project-types/useProjectTypeOptions'
import { ApiError } from '@/lib/api'

import { BacklogItemActions } from './BacklogItemActions'
import { DetailDrawer } from './DetailDrawer'
import { NewWorkPackageInline } from './NewWorkPackageInline'
import { PriorityChip, StatusChip, TypeChip } from './chips'
import {
  parseWorkPackageSort,
  serializeWorkPackageSort,
  WORK_PACKAGE_SORT_LABELS,
  type WorkPackageSort,
} from './displayOptions'
import { usePatchWorkPackage, useWorkPackages } from './api'
import { PRIORITY_LABELS, WP_PRIORITIES, WP_STATUSES, type WorkPackage } from './types'
import { useStatusLabels } from './useStatusLabels'
import { useTypeLabels } from './useTypeLabels'

const BACKLOG_RESULT_FILTER_KEYS = ['status', 'priority', 'type', 'assignee_id', 'q'] as const
const BACKLOG_CONTROL_KEYS = [...BACKLOG_RESULT_FILTER_KEYS, 'sort'] as const
const TRANSIENT_VIEW_KEYS = [
  'new',
  'draft',
  'new_status',
  'new_priority',
  'new_due',
  'wp',
  'move',
] as const

const PROJECT_VIEWS = [
  { path: 'backlog', label: '백로그', icon: ClipboardList },
  { path: 'work-packages', label: '표', icon: Table2 },
  { path: 'board', label: '보드', icon: SquareKanban },
  { path: 'calendar', label: '캘린더', icon: CalendarDays },
  { path: 'timeline', label: '타임라인', icon: ChartGantt },
] as const

type FailedAssignment = {
  wpId: string
  cycleId: string
  subject: string
  conflict: boolean
}

function BacklogSkeleton() {
  return (
    <div data-testid="project-backlog-skeleton" className="min-h-0 flex-1 overflow-hidden">
      <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_7rem_2rem] items-center gap-2 border-b border-of-border bg-of-surface-2/70 px-3 sm:grid-cols-[minmax(0,1fr)_9rem_5rem] sm:gap-3 sm:px-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-7 justify-self-end sm:w-12" />
      </div>
      <div className="divide-y divide-of-border">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="grid min-h-[58px] grid-cols-[minmax(0,1fr)_7rem_2rem] items-center gap-2 px-3 sm:grid-cols-[minmax(0,1fr)_9rem_5rem] sm:gap-3 sm:px-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="h-6 w-16 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3 max-w-72" />
                <Skeleton className="h-2.5 w-24" />
              </div>
            </div>
            <Skeleton className="h-7 w-full" />
            <Skeleton className="ml-auto h-7 w-7" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function BacklogPage() {
  const { projectId } = useParams() as { projectId: string }
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const rawSort = searchParams.get('sort')
  const sort = parseWorkPackageSort(rawSort)
  const [queryDraft, setQueryDraft] = useState(query)
  const [filtersOpen, setFiltersOpen] = useState(() =>
    BACKLOG_CONTROL_KEYS.some((key) => searchParams.has(key)),
  )
  const searchParamsRef = useRef(searchParams)
  const pendingSearchParamsRef = useRef<string | null>(null)
  const filters = {
    no_cycle: 'true',
    open_only: 'true',
    status: searchParams.get('status') ?? undefined,
    priority: searchParams.get('priority') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    assignee_id: searchParams.get('assignee_id') ?? undefined,
    q: query || undefined,
    sort: serializeWorkPackageSort(sort) ?? undefined,
  }
  const workPackages = useWorkPackages(projectId, filters)
  const cycles = useCycles(projectId)
  const update = usePatchWorkPackage(projectId)
  const statusLabel = useStatusLabels(projectId)
  const typeLabel = useTypeLabels(projectId)
  const memberName = useMemberNames(projectId)
  const members = useMembers(projectId)
  const projectTypes = useProjectTypeOptions(projectId, { includeInactive: true })
  const canWrite = useCanWrite(projectId)
  const [failedAssignment, setFailedAssignment] = useState<FailedAssignment | null>(null)
  const [itemActionMessage, setItemActionMessage] = useState<{
    text: string
    tone: 'info' | 'success' | 'error'
  } | null>(null)
  const [activeAction, setActiveAction] = useState<{
    wpId: string
    top: number
    left: number
    trigger: HTMLButtonElement
  } | null>(null)

  useEffect(() => {
    const current = searchParams.toString()
    if (pendingSearchParamsRef.current && pendingSearchParamsRef.current !== current) return
    pendingSearchParamsRef.current = null
    searchParamsRef.current = searchParams
  }, [searchParams])

  const commitSearchParams = useCallback(
    (updateParams: (current: URLSearchParams) => URLSearchParams, replace = true) => {
      const next = updateParams(new URLSearchParams(searchParamsRef.current))
      searchParamsRef.current = next
      const nextSerialized = next.toString()
      const locationSerialized = new URLSearchParams(window.location.search).toString()
      pendingSearchParamsRef.current =
        nextSerialized === locationSerialized ? null : nextSerialized
      setSearchParams(next, { replace })
    },
    [setSearchParams],
  )

  useEffect(() => {
    setQueryDraft(query)
  }, [query])

  useEffect(() => {
    if (rawSort === null || rawSort === serializeWorkPackageSort(sort)) return
    commitSearchParams(
      (next) => {
        next.delete('sort')
        return next
      },
    )
  }, [commitSearchParams, rawSort, sort])

  useEffect(() => {
    if (!activeAction) return
    const { trigger, wpId } = activeAction
    trigger.setAttribute('aria-expanded', 'true')
    trigger.setAttribute('aria-controls', `backlog-actions-${wpId}`)
    return () => {
      trigger.setAttribute('aria-expanded', 'false')
      trigger.removeAttribute('aria-controls')
    }
  }, [activeAction])

  const viewHref = (path: string) => {
    const next = new URLSearchParams(searchParams)
    TRANSIENT_VIEW_KEYS.forEach((key) => next.delete(key))
    const suffix = next.toString()
    return `/projects/${projectId}/${path}${suffix ? `?${suffix}` : ''}`
  }

  const setControl = (key: string, value: string) => {
    commitSearchParams(
      (next) => {
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
    )
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setControl('q', queryDraft.trim())
  }

  const clearSearch = () => {
    setQueryDraft('')
    setControl('q', '')
  }

  const clearFilters = () => {
    setQueryDraft('')
    commitSearchParams(
      (next) => {
        BACKLOG_CONTROL_KEYS.forEach((key) => next.delete(key))
        return next
      },
    )
  }

  const openCreate = () => {
    commitSearchParams((next) => {
      next.set('new', '1')
      next.set('new_status', 'backlog')
      next.delete('new_priority')
      next.delete('new_due')
      return next
    }, false)
  }

  const openDrawer = (id: string, opts: { move?: boolean } = {}) => {
    commitSearchParams((next) => {
      next.set('wp', id)
      if (opts.move) next.set('move', '1')
      else next.delete('move')
      return next
    }, false)
  }

  const openActionMenu = (id: string, trigger: HTMLButtonElement) => {
    if (activeAction?.wpId === id) {
      setActiveAction(null)
      return
    }
    const rect = trigger.getBoundingClientRect()
    const width = 224
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)
    const top = Math.min(rect.bottom + 6, window.innerHeight - 216)
    setActiveAction({ wpId: id, top: Math.max(8, top), left, trigger })
  }

  const assignToCycle = (wp: WorkPackage, cycleId: string) => {
    if (!cycleId || update.isPending) return
    setFailedAssignment(null)
    update.mutate(
      {
        wpId: wp.id,
        patch: { expected_version: wp.version, cycle_id: cycleId },
      },
      {
        onSuccess: () => {
          setFailedAssignment(null)
          setItemActionMessage({
            text: `'${wp.subject}'을(를) 사이클에 배정했습니다.`,
            tone: 'success',
          })
        },
        onError: (error) => {
          setFailedAssignment({
            wpId: wp.id,
            cycleId,
            subject: wp.subject,
            conflict: error instanceof ApiError && error.status === 409,
          })
        },
      },
    )
  }

  const retryAssignment = async () => {
    if (!failedAssignment || update.isPending) return
    const refreshed = await workPackages.refetch()
    const current = refreshed.data?.items.find((item) => item.id === failedAssignment.wpId)
    if (!current) {
      setFailedAssignment(null)
      return
    }
    assignToCycle(current, failedAssignment.cycleId)
  }

  const items = workPackages.data?.items ?? []
  const assignableCycles = (cycles.data?.items ?? []).filter((cycle) => cycle.status !== 'completed')
  const activeFilterCount = BACKLOG_CONTROL_KEYS.filter((key) => searchParams.has(key)).length
  const hasResultFilters = BACKLOG_RESULT_FILTER_KEYS.some((key) => searchParams.has(key))
  const activeWp = activeAction ? items.find((wp) => wp.id === activeAction.wpId) : null

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-of-surface">
      <FrameContextActions>
        <section
          aria-label="프로젝트 백로그 제어"
          className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5"
        >
          {workPackages.data ? (
            <span
              className="shrink-0 text-[11px] tabular-nums text-of-muted"
              aria-label={`백로그 작업 ${workPackages.data.total}개`}
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
              const active = view.path === 'backlog'
              return (
                <Link
                  key={view.path}
                  to={viewHref(view.path)}
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
            aria-controls="project-backlog-filters"
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <SlidersHorizontal size={13} /> 필터
            {activeFilterCount > 0 ? (
              <span className="tabular-nums">{activeFilterCount}</span>
            ) : null}
          </Button>
          <Link
            to={`/projects/${projectId}/dashboard`}
            className="inline-flex h-7 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium text-of-text hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            <BarChart3 size={13} aria-hidden="true" /> 분석
          </Link>
          {canWrite ? (
            <Button size="sm" onClick={openCreate}>
              <Plus size={13} /> 새 작업
            </Button>
          ) : null}
        </section>
      </FrameContextActions>

      {filtersOpen ? (
        <div
          id="project-backlog-filters"
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
                  placeholder="백로그 검색"
                  aria-label="프로젝트 백로그 검색어"
                  className="h-7 pl-8 pr-7 text-xs"
                />
                {queryDraft ? (
                  <button
                    type="button"
                    aria-label="백로그 검색어 지우기"
                    className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-of text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                    onClick={clearSearch}
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>
              <Button type="submit" size="sm" variant="outline">
                <Search size={13} /> 검색
              </Button>
            </form>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <Select
                aria-label="백로그 상태 필터"
                className="h-7 w-28 text-xs"
                value={searchParams.get('status') ?? ''}
                onChange={(event) => setControl('status', event.target.value)}
              >
                <option value="">모든 상태</option>
                {WP_STATUSES.filter((status) => status !== 'done' && status !== 'cancelled').map(
                  (status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ),
                )}
              </Select>
              <Select
                aria-label="백로그 우선순위 필터"
                className="h-7 w-28 text-xs"
                value={searchParams.get('priority') ?? ''}
                onChange={(event) => setControl('priority', event.target.value)}
              >
                <option value="">모든 우선순위</option>
                {WP_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="백로그 타입 필터"
                className="h-7 w-28 text-xs"
                value={searchParams.get('type') ?? ''}
                onChange={(event) => setControl('type', event.target.value)}
              >
                <option value="">모든 타입</option>
                {projectTypes.options.map((type) => (
                  <option key={type.key} value={type.key}>
                    {type.label}
                    {type.isActive ? '' : ' (비활성)'}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="백로그 담당자 필터"
                className="h-7 w-32 text-xs"
                value={searchParams.get('assignee_id') ?? ''}
                onChange={(event) => setControl('assignee_id', event.target.value)}
              >
                <option value="">모든 담당자</option>
                {(members.data?.items ?? []).map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.display_name}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="백로그 정렬"
                className="h-7 w-32 text-xs"
                value={sort}
                onChange={(event) => {
                  const next = event.target.value as WorkPackageSort
                  setControl('sort', serializeWorkPackageSort(next) ?? '')
                }}
              >
                {(Object.keys(WORK_PACKAGE_SORT_LABELS) as WorkPackageSort[]).map((value) => (
                  <option key={value} value={value}>
                    {WORK_PACKAGE_SORT_LABELS[value]}
                  </option>
                ))}
              </Select>
            </div>
            {activeFilterCount > 0 ? (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <RotateCcw size={13} /> 초기화
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {canWrite || searchParams.has('draft') ? (
        <NewWorkPackageInline projectId={projectId} canWrite={canWrite} />
      ) : null}

      {!canWrite ? <ReadOnlyNotice className="mx-4 mt-2" /> : null}
      {itemActionMessage ? (
        <div
          role={itemActionMessage.tone === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`border-b border-of-border px-4 py-2 text-xs ${
            itemActionMessage.tone === 'error'
              ? 'bg-of-danger/10 text-of-danger'
              : 'bg-of-surface-2/60 text-of-muted'
          }`}
        >
          {itemActionMessage.text}
        </div>
      ) : null}
      {failedAssignment ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-of-danger/25 bg-of-danger/10 px-4 py-2 text-xs text-of-danger"
        >
          <span>
            {failedAssignment.conflict
              ? `'${failedAssignment.subject}'이(가) 다른 곳에서 변경되었습니다. 최신 버전으로 다시 시도할 수 있습니다.`
              : `'${failedAssignment.subject}'을(를) 사이클에 배정하지 못했습니다.`}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={update.isPending}
            onClick={() => void retryAssignment()}
          >
            <RotateCcw size={13} /> 다시 시도
          </Button>
        </div>
      ) : null}
      {cycles.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-of-border bg-of-surface-2/60 px-4 py-2 text-xs text-of-muted"
        >
          <span>배정 가능한 사이클을 불러오지 못했습니다. 백로그 작업은 계속 확인할 수 있습니다.</span>
          <Button size="sm" variant="outline" onClick={() => void cycles.refetch()}>
            <RotateCcw size={13} /> 사이클 다시 불러오기
          </Button>
        </div>
      ) : null}

      <section
        aria-label="프로젝트 백로그"
        aria-busy={workPackages.isPending}
        data-testid="project-backlog-results"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-of-border px-3 py-2 sm:px-4">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-of-text">백로그</h1>
            <span className="block truncate text-[11px] text-of-muted">
              {workPackages.isError
                ? '백로그 작업을 불러오지 못했습니다'
                : workPackages.data
                  ? `사이클 미배정 ${workPackages.data.total}건 · 배정 가능 ${assignableCycles.length}개`
                  : '사이클에 배정되지 않은 작업을 불러오는 중'}
            </span>
          </div>
          {workPackages.data && canWrite && assignableCycles.length === 0 && !cycles.isPending ? (
            <Link
              to={`/projects/${projectId}/cycles`}
              className="text-xs font-medium text-of-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            >
              배정할 사이클 만들기
            </Link>
          ) : null}
        </header>

        {workPackages.isPending ? (
          <BacklogSkeleton />
        ) : workPackages.isError ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
            <ErrorState error={workPackages.error} onRetry={() => workPackages.refetch()} />
          </div>
        ) : workPackages.data.total === 0 && hasResultFilters ? (
          <EmptyState
            title="조건에 맞는 백로그 작업이 없습니다"
            hint="검색이나 필터를 초기화해 사이클 미배정 작업을 다시 확인하세요."
          >
            <Button size="sm" variant="outline" onClick={clearFilters}>
              <RotateCcw size={13} /> 현재 보기 초기화
            </Button>
          </EmptyState>
        ) : workPackages.data.total === 0 ? (
          <EmptyState
            title="백로그가 비어 있습니다"
            hint={
              canWrite
                ? '새 작업을 만들거나 기존 작업의 사이클 배정을 해제하면 이곳에 표시됩니다.'
                : '사이클에 배정되지 않은 미완료 작업이 이곳에 표시됩니다.'
            }
          >
            {canWrite ? (
              <Button size="sm" onClick={openCreate}>
                <Plus size={13} /> 첫 백로그 작업 만들기
              </Button>
            ) : null}
          </EmptyState>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="min-w-0">
              <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_7rem_2rem] items-center gap-2 border-b border-of-border bg-of-surface-2/70 px-3 text-[11px] font-medium text-of-muted sm:grid-cols-[minmax(0,1fr)_9rem_5rem] sm:gap-3 sm:px-4">
                <span>작업</span>
                <span>{canWrite ? '사이클 배정' : '담당자'}</span>
                <span className="hidden text-right sm:block">작업 메뉴</span>
              </div>
              <ul aria-label="백로그 작업 목록" className="divide-y divide-of-border">
                {items.map((wp) => (
                  <li
                    key={wp.id}
                    className="grid min-h-[58px] grid-cols-[minmax(0,1fr)_7rem_2rem] items-center gap-2 px-3 transition-colors hover:bg-of-surface-2/60 focus-within:bg-of-surface-2/60 sm:grid-cols-[minmax(0,1fr)_9rem_5rem] sm:gap-3 sm:px-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <TypeChip type={wp.type} label={typeLabel(wp.type)} />
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                        onClick={() => openDrawer(wp.id)}
                      >
                        <span className="block truncate text-[13px] font-medium text-of-text">
                          {wp.subject}
                        </span>
                        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                          <StatusChip status={wp.status} label={statusLabel(wp.status)} />
                          <PriorityChip priority={wp.priority} />
                          <span className="truncate text-[11px] text-of-muted">
                            {memberName(wp.assignee_id)}
                          </span>
                        </span>
                      </button>
                    </div>
                    {canWrite ? (
                      <Select
                        aria-label={`${wp.subject} 사이클 배정`}
                        className="h-7 w-full text-xs"
                        value=""
                        disabled={
                          update.isPending ||
                          cycles.isPending ||
                          cycles.isError ||
                          assignableCycles.length === 0
                        }
                        onChange={(event) => assignToCycle(wp, event.target.value)}
                      >
                        <option value="">
                          {cycles.isPending
                            ? '사이클 불러오는 중…'
                            : assignableCycles.length === 0
                              ? '배정 가능 사이클 없음'
                              : '사이클 배정…'}
                        </option>
                        {assignableCycles.map((cycle) => (
                          <option key={cycle.id} value={cycle.id}>
                            {cycle.name}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="truncate text-xs text-of-muted">
                        {memberName(wp.assignee_id)}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={`${wp.subject} 백로그 항목 작업`}
                      aria-haspopup="menu"
                      aria-expanded={activeAction?.wpId === wp.id}
                      aria-controls={
                        activeAction?.wpId === wp.id ? `backlog-actions-${wp.id}` : undefined
                      }
                      className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-of border border-of-border text-of-muted hover:bg-of-surface-2 hover:text-of-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                      onClick={(event) => openActionMenu(wp.id, event.currentTarget)}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {activeWp && activeAction ? (
        <BacklogItemActions
          wp={activeWp}
          projectId={projectId}
          canWrite={canWrite}
          trigger={activeAction.trigger}
          top={activeAction.top}
          left={activeAction.left}
          onOpen={openDrawer}
          onOpenMove={(id) => openDrawer(id, { move: true })}
          onMessage={(text, tone = 'info') => setItemActionMessage({ text, tone })}
          onClose={() => setActiveAction(null)}
        />
      ) : null}
      <DetailDrawer projectId={projectId} />
    </div>
  )
}
