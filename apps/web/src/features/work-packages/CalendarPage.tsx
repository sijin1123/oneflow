import {
  BarChart3,
  CalendarDays,
  ChartGantt,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  SquareKanban,
  Table2,
  X,
} from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { EmptyState, ErrorState } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useCanWrite } from '@/features/members/useCanWrite'
import { localYearMonth, todayISO } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import { CalendarItemActions, type CalendarItemActionMessage } from './CalendarItemActions'
import { DetailDrawer } from './DetailDrawer'
import { Filters } from './Filters'
import { NewWorkPackageInline } from './NewWorkPackageInline'
import { useWorkPackages } from './api'
import {
  buildCalendar,
  parseCalendarMonth,
  serializeCalendarMonth,
  shiftMonth,
  type CalendarCursor,
  type CalendarDay,
} from './calendar'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const CALENDAR_FILTER_KEYS = [
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

const TRANSIENT_VIEW_KEYS = [
  'month',
  'wp',
  'move',
  'new',
  'draft',
  'new_status',
  'new_priority',
  'new_due',
] as const

const currentMonth = () => localYearMonth()

export function CalendarPage() {
  const { projectId } = useParams() as { projectId: string }
  const [searchParams, setSearchParams] = useSearchParams()
  const rawMonth = searchParams.get('month')
  const cursor = parseCalendarMonth(rawMonth, currentMonth())
  const query = searchParams.get('q') ?? ''
  const [queryDraft, setQueryDraft] = useState(query)
  const [filtersOpen, setFiltersOpen] = useState(() =>
    CALENDAR_FILTER_KEYS.some((key) => searchParams.has(key)),
  )
  const [itemActionMessage, setItemActionMessage] = useState<CalendarItemActionMessage | null>(null)
  const canWrite = useCanWrite(projectId)
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
  const items = workPackages.data?.items
  const cal = useMemo(
    () => buildCalendar(cursor.year, cursor.month, items ?? []),
    [cursor.month, cursor.year, items],
  )
  const todayIso = todayISO()
  const scheduledItems = (items ?? []).filter((workPackage) => workPackage.due_date !== null)
  const monthItemCount = cal.weeks.flat().reduce((total, cell) => total + cell.items.length, 0)
  const activeFilterCount = CALENDAR_FILTER_KEYS.filter((key) => searchParams.has(key)).length
  const hasFilters = activeFilterCount > 0

  useEffect(() => {
    setQueryDraft(query)
  }, [query])

  useEffect(() => {
    if (!rawMonth || serializeCalendarMonth(cursor) === rawMonth) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('month')
      return next
    }, { replace: true })
  }, [cursor, rawMonth, setSearchParams])

  const viewHref = (path: string) => {
    const next = new URLSearchParams(searchParams)
    TRANSIENT_VIEW_KEYS.forEach((key) => next.delete(key))
    const suffix = next.toString()
    return `/projects/${projectId}/${path}${suffix ? `?${suffix}` : ''}`
  }

  const setMonth = (nextCursor: CalendarCursor) => {
    const local = currentMonth()
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (nextCursor.year === local.year && nextCursor.month === local.month) {
        next.delete('month')
      } else {
        next.set('month', serializeCalendarMonth(nextCursor))
      }
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
      CALENDAR_FILTER_KEYS.forEach((key) => next.delete(key))
      return next
    }, { replace: true })
  }

  const clearSearch = () => {
    setQueryDraft('')
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('q')
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

  const openCreate = (dueDate?: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('new', '1')
      next.delete('new_status')
      next.delete('new_priority')
      if (dueDate) next.set('new_due', dueDate)
      else next.delete('new_due')
      return next
    })
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-of-surface">
      <h1 className="sr-only">프로젝트 캘린더</h1>
      <FrameContextActions>
        <section
          aria-label="프로젝트 캘린더 제어"
          className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5"
        >
          {workPackages.data ? (
            <span
              className="shrink-0 text-[11px] tabular-nums text-of-muted"
              aria-label={`이번 달 ${monthItemCount}개, 전체 ${workPackages.data.total}개 작업`}
            >
              {monthItemCount} / {workPackages.data.total}
            </span>
          ) : null}
          <nav
            aria-label="프로젝트 작업 보기"
            className="flex h-7 items-center rounded-of border border-of-border bg-of-surface-2 p-0.5"
          >
            {PROJECT_VIEWS.map((view) => {
              const Icon = view.icon
              const active = view.path === 'calendar'
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
            aria-controls="project-calendar-filters"
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
            <Button size="sm" onClick={() => openCreate()}>
              <Plus size={13} /> 새 작업
            </Button>
          ) : null}
        </section>
      </FrameContextActions>

      {filtersOpen ? (
        <div
          id="project-calendar-filters"
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
                  aria-label="프로젝트 캘린더 검색어"
                  className="h-7 pl-8 pr-7 text-xs"
                />
                {queryDraft ? (
                  <button
                    type="button"
                    aria-label="캘린더 검색어 지우기"
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

      {canWrite || searchParams.has('draft') ? (
        <NewWorkPackageInline projectId={projectId} canWrite={canWrite} />
      ) : null}

      {!canWrite ? <ReadOnlyNotice className="mx-4 mt-2" /> : null}
      {itemActionMessage ? (
        <div
          role={itemActionMessage.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`border-b border-of-border px-4 py-2 text-xs ${
            itemActionMessage.kind === 'error'
              ? 'bg-of-danger/10 text-of-danger'
              : 'bg-of-surface-2/60 text-of-muted'
          }`}
        >
          {itemActionMessage.text}
        </div>
      ) : null}

      <section
        aria-label="프로젝트 작업 캘린더"
        aria-busy={workPackages.isPending}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-of-border px-3 py-2 sm:px-4">
          <div className="min-w-0">
            <strong className="block text-sm font-semibold tabular-nums text-of-text">
              {cursor.year}.{String(cursor.month).padStart(2, '0')}
            </strong>
            <span className="block truncate text-[11px] text-of-muted">
              {workPackages.isError
                ? '월별 마감 일정을 불러오지 못했습니다'
                : workPackages.data
                ? monthItemCount > 0
                  ? `이 달 마감 ${monthItemCount}건 · 일정 있음 ${scheduledItems.length}건`
                  : `이 달 마감 없음 · 일정 있음 ${scheduledItems.length}건`
                : '월별 마감 일정을 불러오는 중'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="이전 달"
              onClick={() => setMonth(shiftMonth(cursor.year, cursor.month, -1))}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMonth(currentMonth())}>
              이번 달
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="다음 달"
              onClick={() => setMonth(shiftMonth(cursor.year, cursor.month, 1))}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </header>

        {workPackages.isPending ? (
          <CalendarSkeleton cursor={cursor} />
        ) : workPackages.isError ? (
          <CalendarStateFrame cursor={cursor}>
            <ErrorState
              error={workPackages.error}
              onRetry={() => workPackages.refetch()}
              className="min-h-0"
            />
          </CalendarStateFrame>
        ) : workPackages.data.total === 0 && hasFilters ? (
          <CalendarStateFrame cursor={cursor}>
            <EmptyState
              title="조건에 맞는 작업이 없습니다"
              hint="검색이나 필터를 조정해 다른 마감 일정을 찾아보세요."
              className="min-h-0"
            >
              <Button size="sm" variant="outline" onClick={clearFilters}>
                <RotateCcw size={13} /> 현재 보기 초기화
              </Button>
            </EmptyState>
          </CalendarStateFrame>
        ) : workPackages.data.total === 0 ? (
          <CalendarStateFrame cursor={cursor}>
            <EmptyState
              title="아직 작업이 없습니다"
              hint={
                canWrite
                  ? '날짜를 선택해 첫 마감 작업을 만들어 보세요.'
                  : '프로젝트 멤버가 기한이 있는 작업을 추가하면 달력에 표시됩니다.'
              }
              className="min-h-0"
            >
              {canWrite ? (
                <Button size="sm" onClick={() => openCreate()}>
                  <Plus size={13} /> 첫 작업 만들기
                </Button>
              ) : null}
            </EmptyState>
          </CalendarStateFrame>
        ) : scheduledItems.length === 0 ? (
          <CalendarStateFrame cursor={cursor}>
            <EmptyState
              title="기한이 정해진 작업이 없습니다"
              hint="작업에 기한을 지정하면 해당 날짜에서 바로 확인할 수 있습니다."
              className="min-h-0"
            >
              {canWrite ? (
                <Button size="sm" onClick={() => openCreate()}>
                  <Plus size={13} /> 마감 작업 만들기
                </Button>
              ) : null}
            </EmptyState>
          </CalendarStateFrame>
        ) : (
          <CalendarGrid
            projectId={projectId}
            days={cal.weeks.flat()}
            todayIso={todayIso}
            canWrite={canWrite}
            onCreate={openCreate}
            onOpenDrawer={openDrawer}
            onMessage={setItemActionMessage}
          />
        )}
      </section>

      <DetailDrawer projectId={projectId} />
    </div>
  )
}

function CalendarGrid({
  projectId,
  days,
  todayIso,
  canWrite,
  onCreate,
  onOpenDrawer,
  onMessage,
}: {
  projectId: string
  days: CalendarDay[]
  todayIso: string
  canWrite: boolean
  onCreate: (dueDate?: string) => void
  onOpenDrawer: (id: string, options?: { move?: boolean }) => void
  onMessage: (message: CalendarItemActionMessage) => void
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-of-surface" data-testid="project-calendar-grid">
      <div className="flex min-h-full min-w-[700px] flex-col">
        <div className="sticky top-0 z-10 grid grid-cols-7 border-b border-of-border bg-of-surface text-center text-[11px] font-medium text-of-muted">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="py-1.5">
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid min-h-[560px] flex-1 auto-rows-fr grid-cols-7">
          {days.map((cell) => (
            <div
              key={cell.iso}
              data-date={cell.iso}
              className={cn(
                'group min-h-24 min-w-0 border-b border-r border-of-border p-1.5',
                !cell.inMonth && 'bg-of-surface-2/45',
              )}
            >
              <div className="mb-1 flex h-5 items-center justify-between gap-1">
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums',
                    cell.inMonth ? 'text-of-text' : 'text-of-muted',
                    cell.iso === todayIso && 'bg-of-accent font-semibold text-white',
                  )}
                >
                  {cell.day}
                </span>
                {canWrite ? (
                  <button
                    type="button"
                    aria-label={`${cell.iso}에 새 작업`}
                    title={`${cell.iso}에 새 작업`}
                    onClick={() => onCreate(cell.iso)}
                    className="flex h-5 w-5 items-center justify-center rounded-of text-of-muted opacity-70 transition-[opacity,color,background-color] hover:bg-of-surface-hover hover:text-of-text focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Plus size={12} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <div className="space-y-1">
                {cell.items.map((workPackage) => (
                  <article
                    key={workPackage.id}
                    className="group/item flex min-w-0 items-center gap-0.5 border-l-2 border-of-accent bg-of-accent-soft px-1.5 py-1 text-[11px] text-of-text transition-colors hover:bg-of-accent-soft/80 focus-within:bg-of-accent-soft/80"
                  >
                    <button
                      type="button"
                      title={workPackage.subject}
                      aria-label={workPackage.subject}
                      onClick={() => onOpenDrawer(workPackage.id)}
                      className="min-w-0 flex-1 truncate text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                    >
                      {workPackage.subject}
                    </button>
                    <CalendarItemActions
                      projectId={projectId}
                      wp={workPackage}
                      canWrite={canWrite}
                      onOpenDrawer={(id) => onOpenDrawer(id)}
                      onOpenMove={(id) => onOpenDrawer(id, { move: true })}
                      onMessage={onMessage}
                    />
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CalendarSkeleton({ cursor }: { cursor: CalendarCursor }) {
  const days = buildCalendar(cursor.year, cursor.month, []).weeks.flat()
  return (
    <div
      role="status"
      aria-label="프로젝트 캘린더 불러오는 중"
      data-testid="project-calendar-skeleton"
      className="min-h-0 flex-1 overflow-hidden bg-of-surface"
    >
      <div className="flex min-h-full min-w-[700px] flex-col">
        <div className="grid grid-cols-7 border-b border-of-border">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="flex justify-center py-1.5">
              <Skeleton className="h-3 w-4" />
            </div>
          ))}
        </div>
        <div className="grid min-h-[560px] flex-1 auto-rows-fr grid-cols-7">
          {days.map((cell, index) => (
            <div
              key={cell.iso}
              className="min-h-24 border-b border-r border-of-border p-1.5"
            >
              <Skeleton className="mb-3 h-5 w-5 rounded-full" />
              {index % 5 === 2 || index % 7 === 4 ? (
                <Skeleton className="h-6 w-full" />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CalendarStateFrame({
  cursor,
  children,
}: {
  cursor: CalendarCursor
  children: ReactNode
}) {
  const days = buildCalendar(cursor.year, cursor.month, []).weeks.flat()
  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden bg-of-surface"
      data-testid="project-calendar-state-frame"
    >
      <div className="flex min-h-full min-w-[700px] flex-col opacity-55" aria-hidden="true">
        <div className="grid grid-cols-7 border-b border-of-border text-center text-[11px] text-of-muted">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="py-1.5">
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid min-h-[560px] flex-1 auto-rows-fr grid-cols-7">
          {days.map((cell) => (
            <div
              key={cell.iso}
              className={cn(
                'min-h-24 border-b border-r border-of-border p-1.5',
                !cell.inMonth && 'bg-of-surface-2/45',
              )}
            >
              <span className="text-[11px] tabular-nums text-of-muted">{cell.day}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-of-surface/70 p-4">
        {children}
      </div>
    </div>
  )
}
