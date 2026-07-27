import {
  BarChart3,
  CalendarDays,
  ChartGantt,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardList,
  ListTree,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  SquareKanban,
  Table2,
  X,
} from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { EmptyState, ErrorState } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useMemberNames, useMembers } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProjectTypeOptions } from '@/features/project-types/useProjectTypeOptions'

import { DetailDrawer } from './DetailDrawer'
import {
  parseWorkPackageSort,
  serializeWorkPackageSort,
  WORK_PACKAGE_SORT_LABELS,
  type WorkPackageSort,
} from './displayOptions'
import { NewWorkPackageInline } from './NewWorkPackageInline'
import { TreeItemActions } from './TreeItemActions'
import { PriorityChip, StatusChip, TypeChip } from './chips'
import { useWorkPackages } from './api'
import { branchIds, buildTree, type TreeNode } from './tree'
import { PRIORITY_LABELS, WP_PRIORITIES, WP_STATUSES } from './types'
import { useStatusLabels } from './useStatusLabels'
import { useTypeLabels } from './useTypeLabels'

const HIERARCHY_RESULT_FILTER_KEYS = ['status', 'priority', 'type', 'assignee_id', 'q'] as const
const HIERARCHY_CONTROL_KEYS = [...HIERARCHY_RESULT_FILTER_KEYS, 'sort'] as const
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
  { path: 'tree', label: '계층', icon: ListTree },
  { path: 'backlog', label: '백로그', icon: ClipboardList },
  { path: 'work-packages', label: '표', icon: Table2 },
  { path: 'board', label: '보드', icon: SquareKanban },
  { path: 'calendar', label: '캘린더', icon: CalendarDays },
  { path: 'timeline', label: '타임라인', icon: ChartGantt },
] as const

function HierarchySkeleton() {
  return (
    <div
      data-testid="project-hierarchy-skeleton"
      className="min-h-0 flex-1 overflow-hidden"
    >
      <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_2rem] items-center gap-2 border-b border-of-border bg-of-surface-2/70 px-3 sm:grid-cols-[minmax(0,1fr)_18rem_2rem] sm:px-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="hidden h-3 w-28 sm:block" />
        <Skeleton className="h-3 w-5 justify-self-end" />
      </div>
      <div className="divide-y divide-of-border">
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="grid min-h-[58px] grid-cols-[minmax(0,1fr)_2rem] items-center gap-2 px-3 sm:grid-cols-[minmax(0,1fr)_18rem_2rem] sm:px-4"
          >
            <div
              className="flex min-w-0 items-center gap-2"
              style={{ paddingLeft: `${(index % 3) * 18}px` }}
            >
              <Skeleton className="h-5 w-5 shrink-0" />
              <Skeleton className="h-6 w-14 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3 max-w-72" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-7 w-7" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function TreePage() {
  const { projectId } = useParams() as { projectId: string }
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const rawSort = searchParams.get('sort')
  const sort = parseWorkPackageSort(rawSort)
  const [queryDraft, setQueryDraft] = useState(query)
  const [filtersOpen, setFiltersOpen] = useState(() =>
    HIERARCHY_CONTROL_KEYS.some((key) => searchParams.has(key)),
  )
  const searchParamsRef = useRef(searchParams)
  const pendingSearchParamsRef = useRef<string | null>(null)
  const filters = {
    status: searchParams.get('status') ?? undefined,
    priority: searchParams.get('priority') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    assignee_id: searchParams.get('assignee_id') ?? undefined,
    q: query || undefined,
    sort: serializeWorkPackageSort(sort) ?? undefined,
  }
  const workPackages = useWorkPackages(projectId, filters)
  const statusLabel = useStatusLabels(projectId)
  const typeLabel = useTypeLabels(projectId)
  const memberName = useMemberNames(projectId)
  const members = useMembers(projectId)
  const projectTypes = useProjectTypeOptions(projectId, { includeInactive: true })
  const canWrite = useCanWrite(projectId)
  const tree = useMemo(
    () => (workPackages.data ? buildTree(workPackages.data.items) : []),
    [workPackages.data],
  )
  const allBranches = useMemo(() => branchIds(tree), [tree])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [itemActionMessage, setItemActionMessage] = useState<{
    text: string
    tone: 'info' | 'success' | 'error'
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
    commitSearchParams((next) => {
      next.delete('sort')
      return next
    })
  }, [commitSearchParams, rawSort, sort])

  useEffect(() => {
    const available = new Set(allBranches)
    setCollapsed((current) => {
      const next = new Set([...current].filter((id) => available.has(id)))
      return next.size === current.size ? current : next
    })
  }, [allBranches])

  const viewHref = (path: string) => {
    const next = new URLSearchParams(searchParams)
    TRANSIENT_VIEW_KEYS.forEach((key) => next.delete(key))
    const suffix = next.toString()
    return `/projects/${projectId}/${path}${suffix ? `?${suffix}` : ''}`
  }

  const setControl = (key: string, value: string) => {
    commitSearchParams((next) => {
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
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
    commitSearchParams((next) => {
      HIERARCHY_CONTROL_KEYS.forEach((key) => next.delete(key))
      return next
    })
  }

  const openCreate = () => {
    commitSearchParams(
      (next) => {
        next.set('new', '1')
        next.delete('new_status')
        next.delete('new_priority')
        next.delete('new_due')
        return next
      },
      false,
    )
  }

  const openDrawer = (id: string, opts: { move?: boolean } = {}) => {
    commitSearchParams(
      (next) => {
        next.set('wp', id)
        if (opts.move) next.set('move', '1')
        else next.delete('move')
        return next
      },
      false,
    )
  }

  const toggle = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const activeFilterCount = HIERARCHY_CONTROL_KEYS.filter((key) =>
    searchParams.has(key),
  ).length
  const hasResultFilters = HIERARCHY_RESULT_FILTER_KEYS.some((key) =>
    searchParams.has(key),
  )

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-of-surface">
      <FrameContextActions>
        <section
          aria-label="프로젝트 계층 제어"
          className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5"
        >
          {workPackages.data ? (
            <span
              className="shrink-0 text-[11px] tabular-nums text-of-muted"
              aria-label={`계층 작업 ${workPackages.data.total}개`}
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
              const active = view.path === 'tree'
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
            aria-controls="project-hierarchy-filters"
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
          id="project-hierarchy-filters"
          className="animate-in border-b border-of-border bg-of-surface px-4 py-2.5 fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none"
        >
          <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center">
            <form
              onSubmit={submitSearch}
              className="flex min-w-[220px] flex-1 gap-2 sm:max-w-sm"
            >
              <div className="relative min-w-0 flex-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
                  aria-hidden="true"
                />
                <Input
                  value={queryDraft}
                  onChange={(event) => setQueryDraft(event.target.value)}
                  placeholder="계층 작업 검색"
                  aria-label="프로젝트 계층 검색어"
                  className="h-7 pl-8 pr-7 text-xs"
                />
                {queryDraft ? (
                  <button
                    type="button"
                    aria-label="계층 검색어 지우기"
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
                aria-label="계층 상태 필터"
                className="h-7 w-28 text-xs"
                value={searchParams.get('status') ?? ''}
                onChange={(event) => setControl('status', event.target.value)}
              >
                <option value="">모든 상태</option>
                {WP_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="계층 우선순위 필터"
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
                aria-label="계층 타입 필터"
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
                aria-label="계층 담당자 필터"
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
                aria-label="계층 정렬"
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

      <section
        aria-label="프로젝트 작업 계층"
        aria-busy={workPackages.isPending}
        data-testid="project-hierarchy-results"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-of-border px-3 py-2 sm:px-4">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-of-text">계층</h1>
            <span className="block truncate text-[11px] text-of-muted">
              {workPackages.isError
                ? '작업 계층을 불러오지 못했습니다'
                : workPackages.data
                  ? `${workPackages.data.total}개 작업 · 상위 작업 ${allBranches.length}개`
                  : '상위 작업과 하위 작업을 불러오는 중'}
            </span>
          </div>
          {allBranches.length > 0 ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="계층 전체 펼치기"
                title="전체 펼치기"
                disabled={collapsed.size === 0}
                onClick={() => setCollapsed(new Set())}
              >
                <ChevronsUpDown size={14} aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="계층 전체 접기"
                title="전체 접기"
                disabled={collapsed.size === allBranches.length}
                onClick={() => setCollapsed(new Set(allBranches))}
              >
                <ChevronsDownUp size={14} aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </header>

        {workPackages.isPending ? (
          <HierarchySkeleton />
        ) : workPackages.isError ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
            <ErrorState error={workPackages.error} onRetry={() => workPackages.refetch()} />
          </div>
        ) : workPackages.data.total === 0 && hasResultFilters ? (
          <EmptyState
            title="조건에 맞는 계층 작업이 없습니다"
            hint="검색이나 필터를 초기화해 전체 작업 계층을 다시 확인하세요."
          >
            <Button size="sm" variant="outline" onClick={clearFilters}>
              <RotateCcw size={13} /> 현재 보기 초기화
            </Button>
          </EmptyState>
        ) : tree.length === 0 ? (
          <EmptyState
            title="작업 계층이 비어 있습니다"
            hint={
              canWrite
                ? '첫 작업을 만든 뒤 상세 화면에서 상위 작업을 연결해 계층을 구성하세요.'
                : '프로젝트에 표시할 수 있는 작업이 없습니다.'
            }
          >
            {canWrite ? (
              <Button size="sm" onClick={openCreate}>
                <Plus size={13} /> 첫 작업 만들기
              </Button>
            ) : null}
          </EmptyState>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="min-w-0">
              <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_2rem] items-center gap-2 border-b border-of-border bg-of-surface-2/70 px-3 text-[11px] font-medium text-of-muted sm:grid-cols-[minmax(0,1fr)_18rem_2rem] sm:px-4">
                <span>작업 계층</span>
                <span className="hidden sm:block">속성</span>
                <span className="sr-only">작업 메뉴</span>
              </div>
              <div role="tree" aria-label="작업 계층" className="divide-y divide-of-border">
                {tree.map((node) => (
                  <TreeRow
                    key={node.wp.id}
                    node={node}
                    collapsed={collapsed}
                    onToggle={toggle}
                    onOpen={openDrawer}
                    onOpenMove={(id) => openDrawer(id, { move: true })}
                    onMessage={(text, tone = 'info') =>
                      setItemActionMessage({ text, tone })
                    }
                    statusLabel={statusLabel}
                    typeLabel={typeLabel}
                    memberName={memberName}
                    projectId={projectId}
                    canWrite={canWrite}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <DetailDrawer projectId={projectId} />
    </div>
  )
}

function TreeRow({
  node,
  collapsed,
  onToggle,
  onOpen,
  onOpenMove,
  onMessage,
  statusLabel,
  typeLabel,
  memberName,
  projectId,
  canWrite,
}: {
  node: TreeNode
  collapsed: Set<string>
  onToggle: (id: string) => void
  onOpen: (id: string, opts?: { move?: boolean }) => void
  onOpenMove: (id: string) => void
  onMessage: (message: string, tone?: 'info' | 'success' | 'error') => void
  statusLabel: (key: string) => string
  typeLabel: (key: string) => string
  memberName: (userId: string | null) => string
  projectId: string
  canWrite: boolean
}) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.wp.id)

  return (
    <div
      role="treeitem"
      aria-level={node.depth + 1}
      aria-expanded={hasChildren ? !isCollapsed : undefined}
    >
      <div className="group grid min-h-[58px] grid-cols-[minmax(0,1fr)_2rem] items-center gap-2 px-3 transition-colors hover:bg-of-surface-2/60 focus-within:bg-of-surface-2/60 sm:grid-cols-[minmax(0,1fr)_18rem_2rem] sm:px-4">
        <div
          className="flex min-w-0 items-center gap-2"
          style={{ paddingLeft: `${Math.min(node.depth, 8) * 18}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={isCollapsed ? '펼치기' : '접기'}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              onClick={() => onToggle(node.wp.id)}
            >
              {isCollapsed ? (
                <ChevronRight size={14} aria-hidden="true" />
              ) : (
                <ChevronDown size={14} aria-hidden="true" />
              )}
            </button>
          ) : (
            <span className="inline-block h-6 w-6 shrink-0" aria-hidden="true" />
          )}
          <TypeChip type={node.wp.type} label={typeLabel(node.wp.type)} />
          <button
            type="button"
            aria-label={node.wp.subject}
            className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            onClick={() => onOpen(node.wp.id)}
          >
            <span className="block truncate text-[13px] font-medium text-of-text hover:text-of-accent">
              {node.wp.subject}
            </span>
            <span className="mt-1 flex min-w-0 items-center gap-1.5 sm:hidden">
              <StatusChip status={node.wp.status} label={statusLabel(node.wp.status)} />
              <PriorityChip priority={node.wp.priority} />
              <span className="truncate text-[11px] text-of-muted">
                {memberName(node.wp.assignee_id)}
              </span>
            </span>
          </button>
        </div>
        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          <StatusChip status={node.wp.status} label={statusLabel(node.wp.status)} />
          <PriorityChip priority={node.wp.priority} />
          <span className="min-w-0 flex-1 truncate text-[11px] text-of-muted">
            {memberName(node.wp.assignee_id)}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-of-muted">
            {node.wp.due_date ?? '기한 없음'}
          </span>
        </div>
        <TreeItemActions
          wp={node.wp}
          projectId={projectId}
          canWrite={canWrite}
          onOpen={onOpen}
          onOpenMove={onOpenMove}
          onMessage={onMessage}
        />
      </div>

      {hasChildren && !isCollapsed ? (
        <div role="group">
          {node.children.map((child) => (
            <TreeRow
              key={child.wp.id}
              node={child}
              collapsed={collapsed}
              onToggle={onToggle}
              onOpen={onOpen}
              onOpenMove={onOpenMove}
              onMessage={onMessage}
              statusLabel={statusLabel}
              typeLabel={typeLabel}
              memberName={memberName}
              projectId={projectId}
              canWrite={canWrite}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
