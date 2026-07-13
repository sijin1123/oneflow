import {
  CalendarDays,
  ChartGantt,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Filter,
  ListChecks,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Table2,
  X,
} from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataGrid, DataGridFrame, type GridDensity } from '@/components/ui/data-grid'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { PageHeader, Toolbar } from '@/components/ui/surface'
import {
  type SearchResultItem,
  type WorkspaceWorkItemScope,
  useWorkspaceWorkItems,
} from '@/features/search/api'
import { PriorityChip, StatusChip, TypeChip } from '@/features/work-packages/chips'
import type { WpPriority } from '@/features/work-packages/types'
import { cn } from '@/lib/utils'

import { WorkspaceCalendarView } from './WorkspaceCalendarView'
import { WorkspaceTimelineView } from './WorkspaceTimelineView'

const PAGE_SIZE = 50
const SCOPES: Array<{ value: WorkspaceWorkItemScope; label: string }> = [
  { value: 'all', label: 'All work items' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'created', label: 'Created' },
  { value: 'subscribed', label: 'Subscribed' },
]
const PRIORITIES: Array<{ value: WpPriority | 'all'; label: string }> = [
  { value: 'all', label: '모든 우선순위' },
  { value: 'urgent', label: '긴급' },
  { value: 'high', label: '높음' },
  { value: 'medium', label: '보통' },
  { value: 'low', label: '낮음' },
  { value: 'none', label: '없음' },
]

export function AllWorkPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const q = searchParams.get('q') ?? ''
  const scope = validChoice(searchParams.get('scope'), ['all', 'assigned', 'created', 'subscribed'], 'all')
  const state = validChoice(searchParams.get('state'), ['all', 'open'], 'all')
  const sort = validChoice(searchParams.get('sort'), ['updated', 'due'], 'updated')
  const priority = validChoice(searchParams.get('priority'), ['all', 'none', 'low', 'medium', 'high', 'urgent'], 'all')
  const layout = validChoice(searchParams.get('layout'), ['board', 'calendar', 'table', 'timeline'], 'board')
  const density = validChoice(searchParams.get('density'), ['compact', 'comfortable'], 'comfortable')
  const page = positiveInt(searchParams.get('page'))
  const [input, setInput] = useState(q)
  const [filtersOpen, setFiltersOpen] = useState(
    state !== 'all' || priority !== 'all' || sort !== 'updated',
  )
  const offset = (page - 1) * PAGE_SIZE
  const query = useWorkspaceWorkItems({
    q,
    scope,
    state,
    sort,
    priority: priority === 'all' ? null : priority,
    limit: PAGE_SIZE,
    offset,
  })

  useEffect(() => setInput(q), [q])

  useEffect(() => {
    if (!query.data) return
    const lastPage = Math.max(1, Math.ceil(query.data.total / PAGE_SIZE))
    if (page <= lastPage) return
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (lastPage === 1) next.delete('page')
      else next.set('page', String(lastPage))
      return next
    }, { replace: true })
  }, [page, query.data, setSearchParams])

  const updateParams = (updates: Record<string, string | null>, replace = true) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      for (const [key, value] of Object.entries(updates)) {
        if (!value || isDefaultParam(key, value)) next.delete(key)
        else next.set(key, value)
      }
      if (!Object.hasOwn(updates, 'page')) next.delete('page')
      return next
    }, { replace })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    updateParams({ q: input.trim() || null })
  }

  const clearSearch = () => {
    setInput('')
    updateParams({ q: null })
  }

  const data = query.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const returnedFrom = data && data.items.length > 0 ? offset + 1 : 0
  const returnedTo = data ? offset + data.items.length : 0
  const scopeLabel = SCOPES.find((item) => item.value === scope)?.label ?? SCOPES[0].label
  const activeFilterCount = Number(state !== 'all') + Number(priority !== 'all') + Number(sort !== 'updated')
  const countText = data
    ? `${data.total}건${data.total > data.items.length ? ` · ${returnedFrom}-${returnedTo}` : ''}`
    : ' '
  const currentRangeLabel = `${returnedFrom}-${returnedTo} / ${data?.total ?? 0}`
  const switchLayout = (nextLayout: 'board' | 'calendar' | 'table' | 'timeline') => {
    updateParams({ layout: nextLayout, page: String(page) })
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <PageHeader
        icon={<ListChecks />}
        title="All work items"
        eyebrow="Views"
        description={(
          <span aria-live="polite">
            {countText}{query.isFetching && !query.isPending ? ' · 업데이트 중' : ''}
          </span>
        )}
      />

      <Toolbar className="flex-wrap gap-2 border-b-0 py-2">
        <label className="relative min-w-44">
          <span className="sr-only">작업 범위</span>
          <select
            aria-label="작업 범위"
            value={scope}
            className="h-8 w-full appearance-none rounded-of border border-of-border bg-of-surface px-2 pr-8 text-xs font-medium text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            onChange={(event) => updateParams({ scope: event.target.value })}
          >
            {SCOPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <Badge variant="neutral" className="pointer-events-none absolute right-7 top-1/2 -translate-y-1/2">
            {data?.total ?? '…'}
          </Badge>
          <ChevronRight size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-of-muted" />
        </label>

        <form onSubmit={submit} className="flex min-w-[15rem] flex-1 gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted" />
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="작업 검색"
              aria-label="전체 작업 검색어"
              className="h-8 pl-8 pr-7 text-xs"
            />
            {input ? (
              <button
                type="button"
                aria-label="입력 지우기"
                className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                onClick={clearSearch}
              >
                <X size={12} />
              </button>
            ) : null}
          </div>
          <Button type="submit" size="sm"><Search size={13} /> 검색</Button>
        </form>

        <div className="flex items-center gap-1">
          <div className="flex h-8 items-center rounded-of border border-of-border bg-of-surface-2 p-0.5" aria-label="레이아웃" role="group">
            <LayoutButton active={layout === 'board'} label="Board" onClick={() => switchLayout('board')}>
              <Columns3 size={14} />
            </LayoutButton>
            <LayoutButton active={layout === 'calendar'} label="Calendar" onClick={() => switchLayout('calendar')}>
              <CalendarDays size={14} />
            </LayoutButton>
            <LayoutButton active={layout === 'table'} label="Table" onClick={() => switchLayout('table')}>
              <Table2 size={14} />
            </LayoutButton>
            <LayoutButton active={layout === 'timeline'} label="Timeline" onClick={() => switchLayout('timeline')}>
              <ChartGantt size={14} />
            </LayoutButton>
          </div>
          <Button
            type="button"
            variant={filtersOpen || activeFilterCount > 0 ? 'secondary' : 'outline'}
            size="sm"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <Filter size={13} /> 필터{activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm"><SlidersHorizontal size={13} /> Display</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>표 밀도</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={density} onValueChange={(value) => updateParams({ density: value, page: String(page) })}>
                {(['comfortable', 'compact'] as GridDensity[]).map((option) => (
                  <DropdownMenuRadioItem key={option} value={option}>
                    {option === 'comfortable' ? '편안하게' : '조밀하게'}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="전체 작업 새로고침"
            className="h-8 w-8"
            onClick={() => query.refetch()}
          >
            <RefreshCw size={13} className={query.isFetching ? 'animate-spin' : undefined} />
          </Button>
        </div>
      </Toolbar>

      {filtersOpen ? (
        <Toolbar aria-label="작업 필터" className="flex-wrap gap-2 py-2">
          <span className="text-[11px] font-medium text-of-muted">Basic</span>
          <select
            aria-label="완료 상태"
            value={state}
            className="h-8 rounded-of border border-of-border bg-of-surface px-2 text-xs"
            onChange={(event) => updateParams({ state: event.target.value })}
          >
            <option value="all">열림 + 완료</option>
            <option value="open">열린 작업만</option>
          </select>
          <select
            aria-label="우선순위 필터"
            value={priority}
            className="h-8 rounded-of border border-of-border bg-of-surface px-2 text-xs"
            onChange={(event) => updateParams({ priority: event.target.value })}
          >
            {PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select
            aria-label="정렬 방식"
            value={sort}
            className="h-8 rounded-of border border-of-border bg-of-surface px-2 text-xs"
            onChange={(event) => updateParams({ sort: event.target.value })}
          >
            <option value="updated">최근 수정순</option>
            <option value="due">기한 빠른순</option>
          </select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            disabled={activeFilterCount === 0}
            onClick={() => updateParams({ state: null, priority: null, sort: null })}
          >
            Clear all
          </Button>
        </Toolbar>
      ) : null}

      <div className="min-h-0 flex-1">
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title={q || activeFilterCount > 0 || scope !== 'all' ? '조건에 맞는 작업이 없습니다' : '작업이 없습니다'}
            hint="범위나 필터를 바꾸어 다시 확인해 보세요."
            visual="illustration"
          />
        ) : layout === 'board' ? (
          <WorkspaceBoard items={data.items} density={density} onOpen={(item) => navigate(workItemPath(item))} />
        ) : layout === 'calendar' ? (
          <WorkspaceCalendarView
            items={data.items}
            density={density}
            total={data.total}
            rangeLabel={currentRangeLabel}
            month={searchParams.get('month')}
            onMonthChange={(month) => updateParams({ month, page: String(page) })}
            onOpen={(item) => navigate(workItemPath(item))}
          />
        ) : layout === 'table' ? (
          <WorkspaceTable
            items={data.items}
            density={density}
            onOpen={(item) => navigate(workItemPath(item))}
          />
        ) : (
          <WorkspaceTimelineView
            items={data.items}
            density={density}
            total={data.total}
            rangeLabel={currentRangeLabel}
            onOpen={(item) => navigate(workItemPath(item))}
          />
        )}
      </div>

      {data && data.total > PAGE_SIZE ? (
        <div className="flex min-h-11 shrink-0 items-center justify-between border-t border-of-border px-3 text-xs text-of-muted">
          <span>{scopeLabel} · {returnedFrom}-{returnedTo} / {data.total}</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" aria-label="이전 페이지" disabled={page <= 1} onClick={() => updateParams({ page: String(page - 1) })}>
              <ChevronLeft size={13} />
            </Button>
            <span>{page} / {totalPages}</span>
            <Button type="button" variant="outline" size="icon" aria-label="다음 페이지" disabled={page >= totalPages} onClick={() => updateParams({ page: String(page + 1) })}>
              <ChevronRight size={13} />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function LayoutButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean
  label: 'Board' | 'Calendar' | 'Table' | 'Timeline'
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={`${label} 레이아웃`}
      title={`${label} 레이아웃`}
      aria-pressed={active}
      className={cn(
        'flex h-7 w-8 items-center justify-center rounded-[4px] text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
        active && 'bg-of-surface text-of-accent shadow-[var(--of-shadow-xs)]',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

const BOARD_GROUPS: Array<{
  key: string
  label: string
  statuses: SearchResultItem['status'][]
}> = [
  { key: 'backlog', label: 'Backlog', statuses: ['backlog'] },
  { key: 'unstarted', label: 'Unstarted', statuses: ['todo'] },
  { key: 'started', label: 'Started', statuses: ['in_progress', 'in_review'] },
  { key: 'completed', label: 'Completed', statuses: ['done', 'cancelled'] },
]

function WorkspaceBoard({
  items,
  density,
  onOpen,
}: {
  items: SearchResultItem[]
  density: GridDensity
  onOpen: (item: SearchResultItem) => void
}) {
  return (
    <div className="of-scrollbar flex h-full min-h-0 gap-3 overflow-x-auto p-3" aria-label="전체 작업 Board">
      {BOARD_GROUPS.map((group) => {
        const groupItems = items.filter((item) => group.statuses.includes(item.status))
        return (
          <section
            key={group.key}
            aria-label={`${group.label} 컬럼`}
            data-density={density}
            className={cn(
              'flex flex-1 flex-col rounded-of bg-of-surface-2',
              density === 'compact' ? 'min-w-[15rem]' : 'min-w-[17rem]',
            )}
          >
            <header className="flex h-10 shrink-0 items-center gap-2 border-b border-of-border-subtle px-3 text-xs font-semibold">
              <span className="h-2 w-2 rounded-full border border-of-border bg-of-surface" />
              {group.label}
              <Badge variant="neutral">{groupItems.length}</Badge>
            </header>
            <div className="of-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
              {groupItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    'block w-full rounded-of border border-of-border bg-of-surface text-left shadow-[var(--of-shadow-xs)] transition-colors hover:border-of-border-strong hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
                    density === 'compact' ? 'p-2' : 'p-3',
                  )}
                  onClick={() => onOpen(item)}
                >
                  <span className="flex items-center gap-2 text-[11px] text-of-muted">
                    <span className="font-mono">{item.project_key}</span>
                    <span className="truncate">{item.project_name}</span>
                  </span>
                  <span className="mt-2 block text-[13px] font-medium leading-5 text-of-text">{item.subject}</span>
                  <span className="mt-3 flex flex-wrap items-center gap-1.5">
                    <StatusChip status={item.status} />
                    <PriorityChip priority={item.priority} />
                    <TypeChip type={item.type} />
                  </span>
                  <span className="mt-3 flex items-center justify-between gap-2 text-[11px] text-of-muted">
                    <span className="truncate">{item.assignee_name ?? '미배정'}</span>
                    <span className="shrink-0">{dateOnly(item.due_date)}</span>
                  </span>
                </button>
              ))}
              {groupItems.length === 0 ? <p className="px-2 py-4 text-center text-xs text-of-muted">작업 없음</p> : null}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function WorkspaceTable({
  items,
  density,
  onOpen,
}: {
  items: SearchResultItem[]
  density: GridDensity
  onOpen: (item: SearchResultItem) => void
}) {
  return (
    <DataGridFrame density={density} className="h-full" aria-label="전체 작업 표 스크롤 영역">
      <DataGrid className="min-w-[1040px] table-fixed text-left">
        <thead className="sticky top-0 z-10 bg-of-surface/95 backdrop-blur">
          <tr className="border-b border-of-border text-[11px] font-medium text-of-muted">
            <th className="h-9 w-[24%] px-4">작업</th><th className="h-9 w-[15%] px-3">프로젝트</th>
            <th className="h-9 w-[9%] px-3">상태</th><th className="h-9 w-[9%] px-3">우선순위</th>
            <th className="h-9 w-[8%] px-3">타입</th><th className="h-9 w-[8%] px-3">담당자</th>
            <th className="h-9 w-[9%] whitespace-nowrap px-2">시작일</th><th className="h-9 w-[9%] whitespace-nowrap px-2">기한</th>
            <th className="h-9 w-[9%] whitespace-nowrap px-2">수정일</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="group border-b border-of-border hover:bg-of-surface-hover focus-within:bg-of-surface-hover">
              <td className="h-10 px-4"><button type="button" className="block w-full truncate rounded-of text-left text-[13px] font-medium hover:text-of-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus" onClick={() => onOpen(item)}>{item.subject}</button></td>
              <td className="h-10 px-3"><span className="flex min-w-0 items-center gap-1.5"><Badge variant="neutral" className="shrink-0 font-mono">{item.project_key}</Badge><span className="truncate text-of-muted">{item.project_name}</span></span></td>
              <td className="px-3 py-2"><StatusChip status={item.status} /></td>
              <td className="px-3 py-2"><PriorityChip priority={item.priority} /></td>
              <td className="px-3 py-2"><TypeChip type={item.type} /></td>
              <td className="h-10 truncate px-3 text-of-muted">{item.assignee_name ?? '—'}</td>
              <td className="h-10 whitespace-nowrap px-2 text-of-muted">{dateOnly(item.start_date)}</td>
              <td className="h-10 whitespace-nowrap px-2 text-of-muted">{dateOnly(item.due_date)}</td>
              <td className="h-10 whitespace-nowrap px-2 text-of-muted">{dateOnly(item.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </DataGrid>
    </DataGridFrame>
  )
}

function validChoice<const T extends string>(value: string | null, choices: readonly T[], fallback: T): T {
  return choices.includes(value as T) ? value as T : fallback
}

function positiveInt(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function isDefaultParam(key: string, value: string) {
  return (
    (key === 'scope' && value === 'all') ||
    (key === 'state' && value === 'all') ||
    (key === 'sort' && value === 'updated') ||
    (key === 'priority' && value === 'all') ||
    (key === 'layout' && value === 'board') ||
    (key === 'density' && value === 'comfortable') ||
    (key === 'page' && value === '1')
  )
}

function workItemPath(item: SearchResultItem) {
  return `/projects/${item.project_id}/work-packages/${item.id}`
}

function dateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : '—'
}
